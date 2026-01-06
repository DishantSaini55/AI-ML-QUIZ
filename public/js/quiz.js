// ===================================
// Live Quiz Game JavaScript
// ===================================

// Show Question
function showQuestion(data) {
  const { questionIndex, totalQuestions, question, options, timer } = data;
  
  // Update progress
  document.getElementById('current-question-num').textContent = questionIndex + 1;
  document.getElementById('total-questions').textContent = totalQuestions;
  
  // Update question text
  document.getElementById('question-text').textContent = question;
  
  // Reset feedback
  document.getElementById('answer-feedback').classList.add('hidden');
  
  // Render options
  const optionsContainer = document.getElementById('options-container');
  optionsContainer.innerHTML = options.map((option, index) => `
    <button 
      class="option-btn" 
      data-index="${index}"
      onclick="submitAnswer(${index})"
    >
      ${option}
      <span class="option-letter">${String.fromCharCode(65 + index)}</span>
    </button>
  `).join('');
  
  // Reset answer stats
  document.getElementById('answered-count').textContent = '0';
  
  // Start timer
  startTimer(timer);
}

// Timer Functions
function startTimer(duration) {
  clearInterval(state.timerInterval);
  state.currentTimer = duration;
  
  const timerText = document.getElementById('timer-text');
  const timerCircle = document.getElementById('timer-circle');
  const circumference = 2 * Math.PI * 26; // r = 26
  
  // Reset circle
  timerCircle.style.strokeDasharray = circumference;
  timerCircle.style.strokeDashoffset = 0;
  
  // Add gradient definition if not exists
  addTimerGradient();
  
  const updateTimer = () => {
    timerText.textContent = state.currentTimer;
    
    // Update circle progress
    const progress = state.currentTimer / duration;
    timerCircle.style.strokeDashoffset = circumference * (1 - progress);
    
    // Change color based on time
    if (state.currentTimer <= 5) {
      timerText.style.color = '#eb3349';
      timerCircle.style.stroke = '#eb3349';
    } else if (state.currentTimer <= 10) {
      timerText.style.color = '#f2994a';
      timerCircle.style.stroke = '#f2994a';
    } else {
      timerText.style.color = 'white';
      timerCircle.style.stroke = 'url(#timer-gradient)';
    }
    
    if (state.currentTimer <= 0) {
      clearInterval(state.timerInterval);
      
      // Auto-submit if not answered (player only)
      if (!state.isHost) {
        const options = document.querySelectorAll('.option-btn:not(.disabled)');
        if (options.length > 0) {
          // Time's up - didn't answer
          disableOptions();
          showTimeUpFeedback();
        }
      }
    }
    
    state.currentTimer--;
  };
  
  updateTimer();
  state.timerInterval = setInterval(updateTimer, 1000);
}

function addTimerGradient() {
  if (document.getElementById('timer-gradient')) return;
  
  const svg = document.querySelector('.timer-svg');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="timer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#4facfe"/>
      <stop offset="100%" style="stop-color:#00f2fe"/>
    </linearGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);
}

// Submit Answer
function submitAnswer(answerIndex) {
  if (state.isHost) return;
  
  // Disable all options
  disableOptions();
  
  // Highlight selected
  const options = document.querySelectorAll('.option-btn');
  options[answerIndex].classList.add('selected');
  
  // Send answer to server
  state.socket.emit('answer:submit', {
    quizCode: state.quizCode,
    answerIndex,
    timeRemaining: Math.max(0, state.currentTimer)
  });
}

function disableOptions() {
  const options = document.querySelectorAll('.option-btn');
  options.forEach(opt => opt.classList.add('disabled'));
}

// Show Answer Feedback
function showAnswerFeedback(data) {
  const { isCorrect, correctAnswer, points, totalScore } = data;
  
  // Update score display
  state.currentScore = totalScore;
  const scoreEl = document.getElementById('current-score');
  scoreEl.textContent = totalScore;
  scoreEl.style.animation = 'scorePop 0.3s ease';
  setTimeout(() => scoreEl.style.animation = '', 300);
  
  // Show feedback overlay
  const feedback = document.getElementById('answer-feedback');
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackText = document.getElementById('feedback-text');
  const feedbackPoints = document.getElementById('feedback-points');
  
  feedbackIcon.className = 'feedback-icon ' + (isCorrect ? 'correct' : 'wrong');
  feedbackIcon.textContent = isCorrect ? '✓' : '✗';
  feedbackText.textContent = isCorrect ? 'Correct!' : 'Wrong!';
  feedbackPoints.textContent = isCorrect ? `+${points} points` : 'No points';
  
  feedback.classList.remove('hidden');
  
  // Hide after delay
  setTimeout(() => {
    feedback.classList.add('hidden');
  }, 2000);
  
  // Highlight correct answer
  revealCorrectAnswer(correctAnswer);
}

function showTimeUpFeedback() {
  const feedback = document.getElementById('answer-feedback');
  const feedbackIcon = document.getElementById('feedback-icon');
  const feedbackText = document.getElementById('feedback-text');
  const feedbackPoints = document.getElementById('feedback-points');
  
  feedbackIcon.className = 'feedback-icon wrong';
  feedbackIcon.textContent = '⏱️';
  feedbackText.textContent = "Time's Up!";
  feedbackPoints.textContent = 'No points';
  
  feedback.classList.remove('hidden');
  
  setTimeout(() => {
    feedback.classList.add('hidden');
  }, 2000);
}

function revealCorrectAnswer(correctIndex) {
  const options = document.querySelectorAll('.option-btn');
  
  options.forEach((opt, index) => {
    opt.classList.add('disabled');
    if (index === correctIndex) {
      opt.classList.add('correct');
    } else if (opt.classList.contains('selected')) {
      opt.classList.add('wrong');
    }
  });
}

// Mini Leaderboard
function updateMiniLeaderboard(leaderboard) {
  const container = document.getElementById('mini-leaderboard-list');
  
  container.innerHTML = leaderboard.slice(0, 10).map((player, index) => {
    const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
    return `
      <div class="mini-ranking-item">
        <span class="mini-rank ${rankClass}">${index + 1}</span>
        <span class="mini-name">${player.name}</span>
        <span class="mini-score">${player.score}</span>
      </div>
    `;
  }).join('');
}

function toggleMiniLeaderboard() {
  const leaderboard = document.getElementById('mini-leaderboard');
  const toggle = document.getElementById('leaderboard-toggle');
  
  if (leaderboard.classList.contains('hidden')) {
    leaderboard.classList.remove('hidden');
    toggle.classList.add('hidden');
  } else {
    leaderboard.classList.add('hidden');
    toggle.classList.remove('hidden');
  }
}

// Final Leaderboard
function showFinalLeaderboard(leaderboard) {
  clearInterval(state.timerInterval);
  
  // Hide quiz controls
  document.getElementById('host-quiz-controls').classList.add('hidden');
  document.getElementById('answer-stats').classList.add('hidden');
  document.getElementById('leaderboard-toggle').classList.add('hidden');
  document.getElementById('mini-leaderboard').classList.add('hidden');
  
  // Update podium
  updatePodium(leaderboard);
  
  // Update full rankings
  updateRankings(leaderboard);
  
  // Show leaderboard page
  showPage('leaderboard');
  
  // Trigger confetti
  createConfetti();
}

function updatePodium(leaderboard) {
  const positions = ['first', 'second', 'third'];
  const medals = ['🥇', '🥈', '🥉'];
  
  positions.forEach((pos, index) => {
    const player = leaderboard[index];
    const nameEl = document.getElementById(`${pos}-name`);
    const scoreEl = document.getElementById(`${pos}-score`);
    const avatarEl = document.getElementById(`${pos}-avatar`);
    
    if (player) {
      nameEl.textContent = player.name;
      scoreEl.textContent = `${player.score} pts`;
      avatarEl.textContent = medals[index];
    } else {
      nameEl.textContent = '-';
      scoreEl.textContent = '0';
      avatarEl.textContent = medals[index];
    }
  });
}

function updateRankings(leaderboard) {
  const container = document.getElementById('rankings-list');
  
  container.innerHTML = leaderboard.map((player, index) => `
    <div class="ranking-item" style="--index: ${index}">
      <span class="ranking-position">${index + 1}</span>
      <span class="ranking-name">${player.name}</span>
      <div class="ranking-stats">
        <span class="ranking-correct">${player.correctAnswers}/${player.totalQuestions} correct</span>
        <span class="ranking-score">${player.score} pts</span>
      </div>
    </div>
  `).join('');
}

// Confetti Animation
function createConfetti() {
  const container = document.getElementById('confetti');
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#38ef7d', '#ffd700'];
  const confettiCount = 150;
  
  container.innerHTML = '';
  
  for (let i = 0; i < confettiCount; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti';
    confetti.style.left = Math.random() * 100 + '%';
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.width = Math.random() * 10 + 5 + 'px';
    confetti.style.height = confetti.style.width;
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    confetti.style.animation = `confettiFall ${Math.random() * 3 + 2}s linear forwards`;
    confetti.style.animationDelay = Math.random() * 2 + 's';
    confetti.style.opacity = '1';
    
    container.appendChild(confetti);
  }
  
  // Clean up after animation
  setTimeout(() => {
    container.innerHTML = '';
  }, 5000);
}
