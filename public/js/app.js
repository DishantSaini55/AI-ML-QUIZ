// ===================================
// Main Application JavaScript
// ===================================

// Global State
const state = {
  socket: null,
  isHost: false,
  quizCode: null,
  playerName: null,
  currentQuiz: null,
  questions: [],
  currentScore: 0,
  timerInterval: null,
  currentTimer: 0
};

// Initialize Socket.IO
function initSocket() {
  state.socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // Connection events
  state.socket.on('connect', () => {
    console.log('Connected to server');
    showToast('Connected!', 'success');
  });
  
  state.socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    showToast('Connecting to server...', 'error');
  });
  
  state.socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showToast('Connection lost. Reconnecting...', 'error');
  });
  
  state.socket.on('error', (data) => {
    showToast(data.message, 'error');
  });
  
  // Host events
  state.socket.on('host:joined', (data) => {
    state.currentQuiz = data.quiz;
    updateHostPlayerList(data.players);
  });
  
  // Player events
  state.socket.on('player:joined', (data) => {
    document.getElementById('player-quiz-title').textContent = data.quizTitle;
    document.getElementById('player-name-display').textContent = state.playerName;
    document.getElementById('waiting-player-count').textContent = data.playerCount;
    showPage('player-waiting');
  });
  
  state.socket.on('player:list', (data) => {
    updateHostPlayerList(data.players);
    document.getElementById('waiting-player-count').textContent = data.players.length;
  });
  
  state.socket.on('player:kicked', () => {
    showToast('You have been removed from the quiz', 'error');
    showPage('join-quiz');
  });
  
  // Quiz events
  state.socket.on('quiz:started', (data) => {
    showPage('live-quiz');
    document.getElementById('total-questions').textContent = data.totalQuestions;
    
    // Show/hide host controls
    if (state.isHost) {
      document.getElementById('host-quiz-controls').classList.remove('hidden');
      document.getElementById('answer-stats').classList.remove('hidden');
    } else {
      document.getElementById('host-quiz-controls').classList.add('hidden');
      document.getElementById('answer-stats').classList.add('hidden');
    }
    
    // Show leaderboard toggle
    document.getElementById('leaderboard-toggle').classList.remove('hidden');
  });
  
  state.socket.on('question:show', (data) => {
    showQuestion(data);
  });
  
  state.socket.on('answer:result', (data) => {
    showAnswerFeedback(data);
  });
  
  state.socket.on('answer:already-submitted', () => {
    showToast('You already answered this question', 'error');
  });
  
  state.socket.on('answer:count', (data) => {
    document.getElementById('answered-count').textContent = data.answered;
    document.getElementById('total-players').textContent = data.total;
  });
  
  state.socket.on('answer:revealed', (data) => {
    revealCorrectAnswer(data.correctAnswer);
  });
  
  state.socket.on('leaderboard:update', (data) => {
    updateMiniLeaderboard(data.leaderboard);
  });
  
  state.socket.on('quiz:paused', () => {
    clearInterval(state.timerInterval);
    showToast('Quiz paused by host', 'info');
  });
  
  state.socket.on('quiz:resumed', () => {
    showToast('Quiz resumed', 'info');
  });
  
  state.socket.on('quiz:ended', (data) => {
    showFinalLeaderboard(data.leaderboard);
  });
  
  state.socket.on('quiz:reset', (data) => {
    state.currentScore = 0;
    document.getElementById('current-score').textContent = '0';
    updateHostPlayerList(data.players);
    showPage('host-waiting');
    showToast('Quiz has been reset', 'info');
  });
}

// Page Navigation
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  const targetPage = document.getElementById(pageId);
  if (targetPage) {
    targetPage.classList.add('active');
  }
  
  // Scroll to top
  window.scrollTo(0, 0);
}

// Quiz Creation Functions
function addQuestion() {
  const questionIndex = state.questions.length;
  
  const questionData = {
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    timer: 30
  };
  
  state.questions.push(questionData);
  
  const questionHtml = `
    <div class="question-item" data-index="${questionIndex}">
      <div class="question-header">
        <span class="question-number">Question ${questionIndex + 1}</span>
        <div class="question-actions">
          <button onclick="moveQuestion(${questionIndex}, -1)" title="Move Up">⬆️</button>
          <button onclick="moveQuestion(${questionIndex}, 1)" title="Move Down">⬇️</button>
          <button class="delete" onclick="deleteQuestion(${questionIndex})" title="Delete">🗑️</button>
        </div>
      </div>
      
      <textarea 
        class="question-input" 
        placeholder="Enter your question..." 
        rows="2"
        onchange="updateQuestion(${questionIndex}, 'question', this.value)"
      ></textarea>
      
      <div class="options-inputs">
        ${[0, 1, 2, 3].map(i => `
          <div class="option-input-group">
            <span class="option-label">${String.fromCharCode(65 + i)}</span>
            <input 
              type="text" 
              placeholder="Option ${i + 1}" 
              onchange="updateOption(${questionIndex}, ${i}, this.value)"
            >
            <input 
              type="radio" 
              name="correct-${questionIndex}" 
              ${i === 0 ? 'checked' : ''}
              onchange="updateCorrectAnswer(${questionIndex}, ${i})"
              title="Mark as correct answer"
            >
          </div>
        `).join('')}
      </div>
      
      <div class="timer-input-group">
        <label>⏱️ Timer:</label>
        <input 
          type="number" 
          class="timer-input" 
          value="30" 
          min="5" 
          max="120"
          onchange="updateQuestion(${questionIndex}, 'timer', parseInt(this.value))"
        >
        <span>seconds</span>
      </div>
    </div>
  `;
  
  document.getElementById('questions-list').insertAdjacentHTML('beforeend', questionHtml);
  updateQuizSummary();
}

function updateQuestion(index, field, value) {
  if (state.questions[index]) {
    state.questions[index][field] = value;
    updateQuizSummary();
  }
}

function updateOption(questionIndex, optionIndex, value) {
  if (state.questions[questionIndex]) {
    state.questions[questionIndex].options[optionIndex] = value;
  }
}

function updateCorrectAnswer(questionIndex, optionIndex) {
  if (state.questions[questionIndex]) {
    state.questions[questionIndex].correctAnswer = optionIndex;
  }
}

function deleteQuestion(index) {
  state.questions.splice(index, 1);
  renderQuestions();
  updateQuizSummary();
}

function moveQuestion(index, direction) {
  const newIndex = index + direction;
  
  if (newIndex < 0 || newIndex >= state.questions.length) return;
  
  const temp = state.questions[index];
  state.questions[index] = state.questions[newIndex];
  state.questions[newIndex] = temp;
  
  renderQuestions();
}

function renderQuestions() {
  const container = document.getElementById('questions-list');
  container.innerHTML = '';
  
  state.questions.forEach((q, index) => {
    const questionHtml = `
      <div class="question-item" data-index="${index}">
        <div class="question-header">
          <span class="question-number">Question ${index + 1}</span>
          <div class="question-actions">
            <button onclick="moveQuestion(${index}, -1)" title="Move Up">⬆️</button>
            <button onclick="moveQuestion(${index}, 1)" title="Move Down">⬇️</button>
            <button class="delete" onclick="deleteQuestion(${index})" title="Delete">🗑️</button>
          </div>
        </div>
        
        <textarea 
          class="question-input" 
          placeholder="Enter your question..." 
          rows="2"
          onchange="updateQuestion(${index}, 'question', this.value)"
        >${q.question}</textarea>
        
        <div class="options-inputs">
          ${[0, 1, 2, 3].map(i => `
            <div class="option-input-group">
              <span class="option-label">${String.fromCharCode(65 + i)}</span>
              <input 
                type="text" 
                placeholder="Option ${i + 1}" 
                value="${q.options[i]}"
                onchange="updateOption(${index}, ${i}, this.value)"
              >
              <input 
                type="radio" 
                name="correct-${index}" 
                ${i === q.correctAnswer ? 'checked' : ''}
                onchange="updateCorrectAnswer(${index}, ${i})"
                title="Mark as correct answer"
              >
            </div>
          `).join('')}
        </div>
        
        <div class="timer-input-group">
          <label>⏱️ Timer:</label>
          <input 
            type="number" 
            class="timer-input" 
            value="${q.timer}" 
            min="5" 
            max="120"
            onchange="updateQuestion(${index}, 'timer', parseInt(this.value))"
          >
          <span>seconds</span>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', questionHtml);
  });
}

function updateQuizSummary() {
  document.getElementById('question-count').textContent = state.questions.length;
  
  const totalTime = state.questions.reduce((sum, q) => sum + (q.timer || 30), 0);
  document.getElementById('total-time').textContent = `${totalTime}s`;
  
  // Enable/disable create button
  const createBtn = document.getElementById('create-quiz-btn');
  createBtn.disabled = state.questions.length === 0;
}

async function createQuiz() {
  const title = document.getElementById('quiz-title').value || 'Untitled Quiz';
  const hostName = document.getElementById('host-name').value || 'Host';
  
  // Validate questions
  const validQuestions = state.questions.filter(q => 
    q.question.trim() && 
    q.options.every(opt => opt.trim())
  );
  
  if (validQuestions.length === 0) {
    showToast('Please add at least one complete question', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/quiz/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        questions: validQuestions,
        hostName
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      state.quizCode = data.quiz.code;
      state.isHost = true;
      state.currentQuiz = data.quiz;
      
      // Display quiz code
      document.getElementById('display-quiz-code').textContent = state.quizCode;
      
      // Join as host via socket
      state.socket.emit('host:join', {
        quizCode: state.quizCode,
        hostName
      });
      
      showPage('host-waiting');
      showToast('Quiz created successfully!', 'success');
    } else {
      showToast('Failed to create quiz', 'error');
    }
  } catch (error) {
    console.error('Error creating quiz:', error);
    showToast('Error creating quiz', 'error');
  }
}

// Join Quiz Functions
async function joinQuiz() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('player-name').value.trim();
  
  if (!code || code.length !== 6) {
    showToast('Please enter a valid 6-character quiz code', 'error');
    return;
  }
  
  if (!name) {
    showToast('Please enter your nickname', 'error');
    return;
  }
  
  state.quizCode = code;
  state.playerName = name;
  state.isHost = false;
  
  // Join via socket
  state.socket.emit('player:join', {
    quizCode: code,
    playerName: name
  });
}

// Host Functions
function updateHostPlayerList(players) {
  const container = document.getElementById('host-players-list');
  const startBtn = document.getElementById('start-quiz-btn');
  
  if (players.length === 0) {
    container.innerHTML = `
      <div class="waiting-message">
        <div class="loader"></div>
        <p>Waiting for players to join...</p>
      </div>
    `;
    startBtn.disabled = true;
    return;
  }
  
  container.innerHTML = players.map(player => `
    <div class="player-chip">
      <div class="avatar">${player.name.charAt(0).toUpperCase()}</div>
      <span>${player.name}</span>
      <button class="kick-btn" onclick="kickPlayer('${player.id}')" title="Kick player">×</button>
    </div>
  `).join('');
  
  document.getElementById('player-count').textContent = players.length;
  startBtn.disabled = false;
}

function startQuiz() {
  if (!state.quizCode) return;
  
  state.socket.emit('quiz:start', { quizCode: state.quizCode });
}

function pauseQuiz() {
  if (!state.quizCode || !state.isHost) return;
  state.socket.emit('quiz:pause', { quizCode: state.quizCode });
}

function resumeQuiz() {
  if (!state.quizCode || !state.isHost) return;
  state.socket.emit('quiz:resume', { quizCode: state.quizCode });
}

function nextQuestion() {
  if (!state.quizCode || !state.isHost) return;
  state.socket.emit('question:next', { quizCode: state.quizCode });
}

function revealAnswer() {
  if (!state.quizCode || !state.isHost) return;
  state.socket.emit('answer:reveal', { quizCode: state.quizCode });
}

function endQuizEarly() {
  if (!state.quizCode || !state.isHost) return;
  if (confirm('Are you sure you want to end the quiz?')) {
    state.socket.emit('quiz:end', { quizCode: state.quizCode });
  }
}

function kickPlayer(playerId) {
  if (!state.quizCode || !state.isHost) return;
  state.socket.emit('player:kick', { quizCode: state.quizCode, playerId });
}

function copyQuizCode() {
  navigator.clipboard.writeText(state.quizCode).then(() => {
    showToast('Quiz code copied!', 'success');
  });
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Play Again / Go Home
function playAgain() {
  if (state.isHost) {
    state.socket.emit('quiz:reset', { quizCode: state.quizCode });
  } else {
    // Player rejoins
    showPage('join-quiz');
    document.getElementById('join-code').value = state.quizCode;
  }
}

function goHome() {
  // Reset state
  state.quizCode = null;
  state.playerName = null;
  state.currentQuiz = null;
  state.questions = [];
  state.currentScore = 0;
  state.isHost = false;
  
  // Clear form inputs
  document.getElementById('quiz-title').value = '';
  document.getElementById('host-name').value = '';
  document.getElementById('questions-list').innerHTML = '';
  document.getElementById('join-code').value = '';
  document.getElementById('player-name').value = '';
  
  // Hide leaderboard toggle
  document.getElementById('leaderboard-toggle').classList.add('hidden');
  document.getElementById('mini-leaderboard').classList.add('hidden');
  
  showPage('landing-page');
}

// Stat Counter Animation
function animateCounters() {
  const counters = document.querySelectorAll('.stat-number[data-count]');
  
  counters.forEach(counter => {
    const target = parseInt(counter.getAttribute('data-count'));
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;
    
    const updateCounter = () => {
      current += step;
      if (current < target) {
        counter.textContent = Math.floor(current).toLocaleString();
        requestAnimationFrame(updateCounter);
      } else {
        counter.textContent = target.toLocaleString() + '+';
      }
    };
    
    // Start animation when element is visible
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          updateCounter();
          observer.unobserve(entry.target);
        }
      });
    });
    
    observer.observe(counter);
  });
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  animateCounters();
  
  // Code input formatting
  document.getElementById('join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
});
