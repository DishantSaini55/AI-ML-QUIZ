const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// In-memory storage (replace with Supabase in production)
const quizzes = new Map();
const activeSessions = new Map();
const playerScores = new Map();

// Generate unique quiz code
function generateQuizCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// API Routes
app.post('/api/quiz/create', (req, res) => {
  const { title, questions, hostName } = req.body;
  const quizId = uuidv4();
  const quizCode = generateQuizCode();
  
  const quiz = {
    id: quizId,
    code: quizCode,
    title: title || 'Untitled Quiz',
    questions: questions || [],
    hostName: hostName || 'Host',
    createdAt: new Date().toISOString(),
    status: 'waiting' // waiting, active, paused, ended
  };
  
  quizzes.set(quizCode, quiz);
  activeSessions.set(quizCode, {
    players: new Map(),
    currentQuestion: -1,
    answers: new Map(),
    startTime: null
  });
  
  res.json({ success: true, quiz: { ...quiz, questions: quiz.questions.length } });
});

app.get('/api/quiz/:code', (req, res) => {
  const { code } = req.params;
  const quiz = quizzes.get(code.toUpperCase());
  
  if (!quiz) {
    return res.status(404).json({ success: false, message: 'Quiz not found' });
  }
  
  // Don't send answers to non-host
  const safeQuiz = {
    ...quiz,
    questions: quiz.questions.map(q => ({
      question: q.question,
      options: q.options,
      timer: q.timer
    }))
  };
  
  res.json({ success: true, quiz: safeQuiz });
});

app.get('/api/quiz/:code/full', (req, res) => {
  const { code } = req.params;
  const quiz = quizzes.get(code.toUpperCase());
  
  if (!quiz) {
    return res.status(404).json({ success: false, message: 'Quiz not found' });
  }
  
  res.json({ success: true, quiz });
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Host creates/joins quiz room
  socket.on('host:join', ({ quizCode, hostName }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    
    if (!quiz) {
      socket.emit('error', { message: 'Quiz not found' });
      return;
    }
    
    socket.join(code);
    socket.quizCode = code;
    socket.isHost = true;
    socket.hostName = hostName;
    
    const session = activeSessions.get(code);
    socket.emit('host:joined', {
      quiz,
      players: Array.from(session.players.values())
    });
  });
  
  // Player joins quiz
  socket.on('player:join', ({ quizCode, playerName }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    
    if (!quiz) {
      socket.emit('error', { message: 'Quiz not found' });
      return;
    }
    
    if (quiz.status === 'ended') {
      socket.emit('error', { message: 'Quiz has ended' });
      return;
    }
    
    const session = activeSessions.get(code);
    const playerId = socket.id;
    
    const player = {
      id: playerId,
      name: playerName,
      score: 0,
      correctAnswers: 0,
      totalTime: 0,
      joinedAt: Date.now()
    };
    
    session.players.set(playerId, player);
    
    socket.join(code);
    socket.quizCode = code;
    socket.isHost = false;
    socket.playerName = playerName;
    
    socket.emit('player:joined', {
      quizTitle: quiz.title,
      status: quiz.status,
      playerCount: session.players.size
    });
    
    // Notify host and other players
    io.to(code).emit('player:list', {
      players: Array.from(session.players.values())
    });
    
    // If quiz is already active, send current question
    if (quiz.status === 'active' && session.currentQuestion >= 0) {
      const q = quiz.questions[session.currentQuestion];
      socket.emit('question:show', {
        questionIndex: session.currentQuestion,
        totalQuestions: quiz.questions.length,
        question: q.question,
        options: q.options,
        timer: q.timer
      });
    }
  });
  
  // Host starts quiz
  socket.on('quiz:start', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    quiz.status = 'active';
    const session = activeSessions.get(code);
    session.currentQuestion = 0;
    session.answers.clear();
    session.startTime = Date.now();
    
    io.to(code).emit('quiz:started', {
      totalQuestions: quiz.questions.length
    });
    
    // Send first question
    sendQuestion(code, 0);
  });
  
  // Host sends next question
  socket.on('question:next', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    const session = activeSessions.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    const nextIndex = session.currentQuestion + 1;
    
    if (nextIndex >= quiz.questions.length) {
      // Quiz ended
      endQuiz(code);
      return;
    }
    
    session.currentQuestion = nextIndex;
    session.answers.clear();
    
    sendQuestion(code, nextIndex);
  });
  
  // Player submits answer
  socket.on('answer:submit', ({ quizCode, answerIndex, timeRemaining }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    const session = activeSessions.get(code);
    
    if (!quiz || !session || socket.isHost) return;
    
    const playerId = socket.id;
    const player = session.players.get(playerId);
    
    if (!player) return;
    
    // Check if already answered
    if (session.answers.has(playerId)) {
      socket.emit('answer:already-submitted');
      return;
    }
    
    const currentQ = quiz.questions[session.currentQuestion];
    const isCorrect = answerIndex === currentQ.correctAnswer;
    const timeTaken = currentQ.timer - timeRemaining;
    
    // Calculate score (faster = more points)
    let points = 0;
    if (isCorrect) {
      points = Math.round(1000 * (timeRemaining / currentQ.timer));
      points = Math.max(points, 100); // Minimum 100 points for correct answer
      player.score += points;
      player.correctAnswers++;
    }
    player.totalTime += timeTaken;
    
    session.answers.set(playerId, {
      answerIndex,
      isCorrect,
      points,
      timeTaken
    });
    
    // Send feedback to player
    socket.emit('answer:result', {
      isCorrect,
      correctAnswer: currentQ.correctAnswer,
      points,
      totalScore: player.score
    });
    
    // Update answer count for host
    io.to(code).emit('answer:count', {
      answered: session.answers.size,
      total: session.players.size
    });
    
    // Send updated leaderboard
    sendLeaderboard(code);
  });
  
  // Host pauses quiz
  socket.on('quiz:pause', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    quiz.status = 'paused';
    io.to(code).emit('quiz:paused');
  });
  
  // Host resumes quiz
  socket.on('quiz:resume', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    quiz.status = 'active';
    io.to(code).emit('quiz:resumed');
  });
  
  // Host ends quiz
  socket.on('quiz:end', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    if (!socket.isHost) return;
    endQuiz(code);
  });
  
  // Host kicks player
  socket.on('player:kick', ({ quizCode, playerId }) => {
    const code = quizCode.toUpperCase();
    const session = activeSessions.get(code);
    
    if (!session || !socket.isHost) return;
    
    session.players.delete(playerId);
    io.to(playerId).emit('player:kicked');
    
    io.to(code).emit('player:list', {
      players: Array.from(session.players.values())
    });
  });
  
  // Host shows correct answer
  socket.on('answer:reveal', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    const session = activeSessions.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    const currentQ = quiz.questions[session.currentQuestion];
    
    io.to(code).emit('answer:revealed', {
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation || null
    });
  });
  
  // Reset quiz
  socket.on('quiz:reset', ({ quizCode }) => {
    const code = quizCode.toUpperCase();
    const quiz = quizzes.get(code);
    const session = activeSessions.get(code);
    
    if (!quiz || !socket.isHost) return;
    
    quiz.status = 'waiting';
    session.currentQuestion = -1;
    session.answers.clear();
    
    // Reset player scores
    session.players.forEach(player => {
      player.score = 0;
      player.correctAnswers = 0;
      player.totalTime = 0;
    });
    
    io.to(code).emit('quiz:reset', {
      players: Array.from(session.players.values())
    });
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.quizCode) {
      const session = activeSessions.get(socket.quizCode);
      if (session && !socket.isHost) {
        session.players.delete(socket.id);
        io.to(socket.quizCode).emit('player:list', {
          players: Array.from(session.players.values())
        });
      }
    }
  });
});

// Helper functions
function sendQuestion(quizCode, questionIndex) {
  const quiz = quizzes.get(quizCode);
  const q = quiz.questions[questionIndex];
  
  io.to(quizCode).emit('question:show', {
    questionIndex,
    totalQuestions: quiz.questions.length,
    question: q.question,
    options: q.options,
    timer: q.timer
  });
}

function sendLeaderboard(quizCode) {
  const session = activeSessions.get(quizCode);
  
  const leaderboard = Array.from(session.players.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalTime - b.totalTime; // Faster time wins ties
    })
    .map((player, index) => ({
      rank: index + 1,
      name: player.name,
      score: player.score,
      correctAnswers: player.correctAnswers
    }));
  
  io.to(quizCode).emit('leaderboard:update', { leaderboard });
}

function endQuiz(quizCode) {
  const quiz = quizzes.get(quizCode);
  const session = activeSessions.get(quizCode);
  
  if (!quiz) return;
  
  quiz.status = 'ended';
  
  const finalLeaderboard = Array.from(session.players.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalTime - b.totalTime;
    })
    .map((player, index) => ({
      rank: index + 1,
      name: player.name,
      score: player.score,
      correctAnswers: player.correctAnswers,
      totalQuestions: quiz.questions.length
    }));
  
  io.to(quizCode).emit('quiz:ended', {
    leaderboard: finalLeaderboard
  });
}

// Serve frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Quiz server running on http://localhost:${PORT}`);
});
