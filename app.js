// ====================================================
//  APLIKASI LITERASI – 10 SOAL SEQUENTIAL
//  Auto-retry, background, detail lengkap
// ====================================================

const CONFIG = {
    API_URL: 'https://cardigan-unmixed-saddled.ngrok-free.dev', // Ganti dengan URL ngrok Anda
    SHEET_URL: 'https://script.google.com/macros/s/AKfycbxYoqc7oHFiKw8VmPrXRcSNzWRK4t7vn8zO15pBSOWX3jKwXCuFr1WRKaAwl4JsA37srw/exec',
    TOTAL_QUESTIONS: 10,  // <--- DIUBAH MENJADI 10
    MAX_RETRIES: 5,
    RETRY_DELAY: 3000,
};

// ---------- STATE ----------
const state = {
    name: '',
    level: 2,
    questions: [],
    boxesStatus: [],
    scores: [],
    timerInterval: null,
    countdownInterval: null,
    isAnswering: false,
    isReading: false,
    recognition: null,
    results: [],
    readFinishTimeout: null,
    generating: false,
};

// ---------- DOM UTILITY ----------
const $ = (id) => document.getElementById(id);
const dom = {
    name: $('studentName'),
    levelBtns: document.querySelectorAll('.level-btn'),
    startBtn: $('startBtn'),
    loading: $('loadingIndicator'),
    boxesGrid: $('boxesGrid'),
    progressText: $('progressText'),
    totalScoreValue: $('totalScoreValue'),
    resultsList: $('resultsList'),
    headerName: $('headerName'),
    headerLevel: $('headerLevel'),
    clockDisplay: $('clockDisplay'),
    warningModal: $('warningModal'),
    warningTitle: $('warningTitle'),
    warningDesc: $('warningDesc'),
    countdownNumber: $('countdownNumber'),
    warningCountdown: $('warningCountdown'),
    questionModal: $('questionModal'),
    qBadge: $('qBadge'),
    qTimeLeft: $('qTimeLeft'),
    questionText: $('questionText'),
    qCloseBtn: $('qCloseBtn'),
    answerModal: $('answerModal'),
    aTimeLeft: $('aTimeLeft'),
    answerInput: $('answerInput'),
    voiceBtn: $('voiceBtn'),
    voiceStatus: $('voiceStatus'),
    answerSaveBtn: $('answerSaveBtn'),
    answerCloseBtn: $('answerCloseBtn'),
    scoreModal: $('scoreModal'),
    scoreNumber: $('scoreNumber'),
    scoreComment: $('scoreComment'),
    scoreCloseBtn: $('scoreCloseBtn'),
    expectedIdeaText: $('expectedIdeaText'),
    detailModal: $('detailModal'),
    detailQuestion: $('detailQuestion'),
    detailAnswer: $('detailAnswer'),
    detailScore: $('detailScore'),
    detailComment: $('detailComment'),
    detailExpectedIdea: $('detailExpectedIdea'),
    detailCloseBtn: $('detailCloseBtn'),
};

// ---------- UTILITY ----------
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function showModal(modal) { modal.classList.add('active'); }
function hideModal(modal) { modal.classList.remove('active'); }
function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    if (state.readFinishTimeout) {
        clearTimeout(state.readFinishTimeout);
        state.readFinishTimeout = null;
    }
}

function getLevelConfig(level) {
    const configs = {
        1: { timeRead: 5 * 60, timeWrite: 3 * 60, wordCount: '200-250', maxAnswerWords: 25 },
        2: { timeRead: 10 * 60, timeWrite: 5 * 60, wordCount: '350-450', maxAnswerWords: 50 },
        3: { timeRead: 15 * 60, timeWrite: 7 * 60, wordCount: '750-800', maxAnswerWords: 75 }
    };
    return configs[level];
}

function showToast(message, duration = 3000) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: #142b3f;
        color: #f0f4fa;
        padding: 12px 24px;
        border-radius: 40px;
        box-shadow: 0 8px 25px rgba(0,0,0,0.6);
        border: 1px solid #f9c74f;
        z-index: 9999;
        font-weight: 600;
        font-size: 0.95rem;
        max-width: 90%;
        text-align: center;
        animation: toastIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Tambahkan keyframe toast
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`;
document.head.appendChild(styleSheet);

// ---------- API CALL DENGAN RETRY (EXPO BACKOFF) ----------
async function callApiWithRetry(payload, retries = CONFIG.MAX_RETRIES) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }
            const data = await response.json();
            if (data.status === 'success') return data;
            throw new Error(data.message || 'Unknown error');
        } catch (e) {
            lastError = e;
            console.warn(`Attempt ${attempt} failed:`, e.message);
            if (attempt < retries) {
                const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Gagal setelah ${retries} percobaan: ${lastError.message}`);
}

// ---------- GENERATE 10 SOAL SEQUENTIAL (1 per 1) ----------
async function generateAllQuestions(level, name) {
    if (state.generating) return;
    state.generating = true;
    dom.loading.style.display = 'block';
    dom.startBtn.disabled = true;

    // Inisialisasi state untuk 10 soal
    state.questions = [];
    state.boxesStatus = [];
    state.scores = [];
    for (let i = 0; i < CONFIG.TOTAL_QUESTIONS; i++) {
        state.questions.push({
            id: i,
            text: null,
            timeRead: 0,
            timeWrite: 0,
            answer: null,
            score: null,
            status: 'loading',
            expected_idea: null,
            comment: null,
        });
        state.boxesStatus.push('loading');
        state.scores.push(null);
    }
    renderBoxes();
    showToast('⏳ Menghasilkan 10 soal (satu per satu)...');

    // Jalankan sequential
    for (let i = 0; i < CONFIG.TOTAL_QUESTIONS; i++) {
        try {
            const data = await generateSingleQuestionWithRetry(level, name, i);
            if (data.questions && data.questions.length > 0) {
                const q = data.questions[0];
                state.questions[i].text = q.text;
                state.questions[i].timeRead = q.timeRead;
                state.questions[i].timeWrite = q.timeWrite;
                state.questions[i].status = 'ready';
                state.boxesStatus[i] = 'white';
                showToast(`✅ Soal #${i+1} siap!`);
            } else {
                state.questions[i].status = 'error';
                state.boxesStatus[i] = 'error';
            }
        } catch (e) {
            state.questions[i].status = 'error';
            state.boxesStatus[i] = 'error';
            console.error(`Soal #${i+1} gagal:`, e);
        }
        renderBoxes();
        // Beri jeda 1 detik antar request agar tidak overload
        if (i < CONFIG.TOTAL_QUESTIONS - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const failed = state.questions.filter(q => q.status === 'error').length;
    if (failed > 0) {
        showToast(`⚠️ ${failed} soal gagal dibuat. Coba refresh atau klik "Mulai Kerjakan" lagi.`);
    } else {
        showToast('✅ Semua soal siap! Klik kotak untuk mulai.');
    }

    dom.loading.style.display = 'none';
    dom.startBtn.disabled = false;
    state.generating = false;
}

// ---------- GENERATE SATU SOAL DENGAN RETRY ----------
async function generateSingleQuestionWithRetry(level, name, index) {
    const payload = { action: 'generateQuestions', level, name };
    return await callApiWithRetry(payload, CONFIG.MAX_RETRIES);
}

// ---------- EVALUASI JAWABAN (background) ----------
async function evaluateAnswerViaAI(question, answer, level) {
    const payload = {
        action: 'evaluateAnswer',
        level,
        question,
        answer,
        name: state.name
    };
    const data = await callApiWithRetry(payload, CONFIG.MAX_RETRIES);
    return {
        score: data.score || 0,
        comment: data.comment || 'Tidak ada komentar',
        expected_idea: data.expected_idea || 'Tidak tersedia'
    };
}

// ---------- RENDER BOXES (dengan status lengkap) ----------
function renderBoxes() {
    const grid = dom.boxesGrid;
    grid.innerHTML = '';
    const total = state.questions.length;
    for (let i = 0; i < total; i++) {
        const q = state.questions[i];
        const status = state.boxesStatus[i] || 'white';
        const box = document.createElement('div');
        box.className = `box-item status-${status}`;
        if (status === 'white' || status === 'green') {
            // bisa diklik
        } else {
            box.classList.add('disabled');
        }
        box.dataset.index = i;

        let statusLabel = '';
        switch (status) {
            case 'loading': statusLabel = '⏳'; break;
            case 'white': statusLabel = '● siap'; break;
            case 'red': statusLabel = '◉ dibuka'; break;
            case 'green': statusLabel = '✓ selesai'; break;
            case 'yellow': statusLabel = '⌛ dinilai'; break;
            case 'error': statusLabel = '✗ error'; break;
            default: statusLabel = '';
        }
        box.innerHTML = `
            <span class="box-number">${i+1}</span>
            <span class="box-status">${statusLabel}</span>
        `;

        if (status === 'white' && q && q.status === 'ready') {
            box.addEventListener('click', () => handleBoxClick(i));
        } else if (status === 'green' && q && q.status === 'answered') {
            box.addEventListener('click', () => showResultDetail(i));
        }

        grid.appendChild(box);
    }
    updateProgress();
}

function updateProgress() {
    const done = state.boxesStatus.filter(s => s === 'green').length;
    const total = state.boxesStatus.length;
    dom.progressText.textContent = `${done} / ${total} selesai`;
    const totalScore = state.scores.reduce((a, b) => a + (b || 0), 0);
    dom.totalScoreValue.textContent = totalScore;
}

// ---------- KLIK KOTAK ----------
function handleBoxClick(index) {
    if (state.boxesStatus[index] !== 'white') return;
    const q = state.questions[index];
    if (!q || q.status !== 'ready') {
        alert('Soal belum siap.');
        return;
    }
    state.boxesStatus[index] = 'red';
    state.currentBox = index;
    renderBoxes();
    showWarning(index);
}

// ---------- WARNING 3 DETIK ----------
function showWarning(index) {
    const q = state.questions[index];
    if (!q) return;
    const config = getLevelConfig(state.level);
    dom.warningTitle.textContent = `Soal #${index+1}`;
    dom.warningDesc.textContent = `Bacalah cerita dengan teliti. Waktu baca: ${Math.floor(config.timeRead/60)} menit.`;
    let count = 3;
    dom.countdownNumber.textContent = count;
    dom.warningCountdown.textContent = count;
    showModal(dom.warningModal);
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    state.countdownInterval = setInterval(() => {
        count--;
        dom.countdownNumber.textContent = count;
        dom.warningCountdown.textContent = count;
        if (count <= 0) {
            clearInterval(state.countdownInterval);
            state.countdownInterval = null;
            hideModal(dom.warningModal);
            openQuestionModal(index);
        }
    }, 1000);
}

// ---------- MODAL SOAL (BACA) ----------
function openQuestionModal(index) {
    const q = state.questions[index];
    if (!q) return;
    dom.qBadge.textContent = `Soal #${index+1}`;
    dom.questionText.textContent = q.text;
    let timeLeft = q.timeRead;
    dom.qTimeLeft.textContent = formatTime(timeLeft);
    
    dom.qCloseBtn.disabled = true;
    dom.qCloseBtn.textContent = 'Membaca...';
    dom.qCloseBtn.onclick = null;
    
    showModal(dom.questionModal);
    state.isReading = true;
    stopTimer();
    
    state.timerInterval = setInterval(() => {
        timeLeft--;
        dom.qTimeLeft.textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            dom.qCloseBtn.disabled = false;
            dom.qCloseBtn.textContent = 'Selesai Membaca (waktu habis)';
        }
    }, 1000);
    
    state.readFinishTimeout = setTimeout(() => {
        if (state.isReading) {
            dom.qCloseBtn.disabled = false;
            dom.qCloseBtn.textContent = 'Selesai Membaca';
        }
    }, 3000);
    
    dom.qCloseBtn.onclick = function() {
        if (dom.qCloseBtn.disabled) return;
        hideModal(dom.questionModal);
        state.isReading = false;
        stopTimer();
        openAnswerModal(index);
    };
}

// ---------- MODAL JAWAB ----------
function openAnswerModal(index) {
    const q = state.questions[index];
    if (!q) return;
    dom.answerInput.value = '';
    let timeLeft = q.timeWrite;
    dom.aTimeLeft.textContent = formatTime(timeLeft);
    showModal(dom.answerModal);
    state.isAnswering = true;
    stopTimer();
    state.timerInterval = setInterval(() => {
        timeLeft--;
        dom.aTimeLeft.textContent = formatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            handleSaveAnswer(index);
        }
    }, 1000);

    // Voice recognition
    if (!state.recognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            state.recognition = new SpeechRecognition();
            state.recognition.lang = 'id-ID';
            state.recognition.continuous = true;
            state.recognition.interimResults = false;
            state.recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                dom.answerInput.value += transcript + ' ';
                dom.voiceStatus.textContent = 'Suara diterima...';
            };
            state.recognition.onend = () => {
                dom.voiceBtn.classList.remove('recording');
                dom.voiceStatus.textContent = 'Rekaman berhenti. Klik mikrofon lagi.';
            };
        } else {
            dom.voiceBtn.style.display = 'none';
            dom.voiceStatus.textContent = 'Voice tidak didukung.';
        }
    }
    dom.voiceBtn.onclick = function() {
        if (!state.recognition) return;
        if (dom.voiceBtn.classList.contains('recording')) {
            state.recognition.stop();
            dom.voiceBtn.classList.remove('recording');
            dom.voiceStatus.textContent = 'Rekaman dihentikan.';
        } else {
            state.recognition.start();
            dom.voiceBtn.classList.add('recording');
            dom.voiceStatus.textContent = 'Merekam...';
        }
    };
    dom.answerSaveBtn.onclick = () => handleSaveAnswer(index);
    dom.answerCloseBtn.onclick = () => {
        hideModal(dom.answerModal);
        state.isAnswering = false;
        stopTimer();
        state.boxesStatus[index] = 'white';
        renderBoxes();
        if (state.recognition && dom.voiceBtn.classList.contains('recording')) {
            state.recognition.stop();
            dom.voiceBtn.classList.remove('recording');
        }
    };
}

// ---------- SIMPAN JAWABAN & EVALUASI BACKGROUND ----------
async function handleSaveAnswer(index) {
    if (state.isAnswering === false) return;
    const q = state.questions[index];
    const answer = dom.answerInput.value.trim();
    if (!answer) {
        alert('Tulis jawaban terlebih dahulu!');
        return;
    }
    stopTimer();
    state.isAnswering = false;
    hideModal(dom.answerModal);
    if (state.recognition && dom.voiceBtn.classList.contains('recording')) {
        state.recognition.stop();
        dom.voiceBtn.classList.remove('recording');
    }

    q.answer = answer;
    q.status = 'evaluating';
    state.boxesStatus[index] = 'yellow';
    renderBoxes();
    showToast(`⏳ Menganalisis jawaban #${index+1}...`);

    dom.loading.style.display = 'block';
    try {
        const result = await evaluateAnswerViaAI(q.text, answer, state.level);
        q.score = result.score;
        q.comment = result.comment;
        q.expected_idea = result.expected_idea;
        q.status = 'answered';
        state.boxesStatus[index] = 'green';
        state.scores[index] = result.score;
        renderBoxes();
        updateProgress();
        showToast(`✅ Soal #${index+1} selesai! Skor: ${result.score}/10`);

        postToScript({
            action: 'saveResult',
            name: state.name,
            level: state.level,
            question: q.text,
            answer: answer,
            score: result.score,
            comment: result.comment,
            expected_idea: result.expected_idea
        }).catch(err => console.warn('Gagal simpan sheet:', err));

    } catch (e) {
        console.error(e);
        alert('Gagal mengevaluasi jawaban: ' + e.message);
        q.status = 'ready';
        state.boxesStatus[index] = 'white';
        renderBoxes();
    } finally {
        dom.loading.style.display = 'none';
    }
}

// ---------- TAMPILKAN DETAIL HASIL ----------
function showResultDetail(index) {
    const q = state.questions[index];
    if (!q || q.status !== 'answered') return;
    dom.detailQuestion.textContent = q.text;
    dom.detailAnswer.textContent = q.answer || '(kosong)';
    dom.detailScore.textContent = q.score + '/10';
    dom.detailComment.textContent = q.comment || '-';
    dom.detailExpectedIdea.textContent = q.expected_idea || 'Tidak tersedia';
    showModal(dom.detailModal);
}

// ---------- KOMUNIKASI KE SHEET ----------
async function postToScript(payload) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));
    const response = await fetch(CONFIG.SHEET_URL, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
}

async function fetchResults() {
    try {
        const resp = await fetch(CONFIG.SHEET_URL + '?action=getResults');
        const data = await resp.json();
        if (data.status === 'success' && data.results) {
            state.results = data.results;
            renderResults();
        }
    } catch (e) {
        console.error('Gagal fetch hasil', e);
    }
}

function renderResults() {
    const list = dom.resultsList;
    list.innerHTML = '';
    if (!state.results || state.results.length === 0) {
        list.innerHTML = '<p class="empty-msg">Belum ada hasil.</p>';
        return;
    }
    state.results.slice().reverse().forEach(row => {
        const div = document.createElement('div');
        div.className = 'result-item';
        div.innerHTML = `
            <span class="r-name">${row.name || 'Anonim'} (${row.level || '-'})</span>
            <span class="r-score">${row.score || 0} / 10</span>
            <span class="r-time">${row.waktu || '-'}</span>
        `;
        list.appendChild(div);
    });
}

// ---------- CLOCK ----------
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    dom.clockDisplay.textContent = `${h}:${m}`;
}
setInterval(updateClock, 1000);
updateClock();

// ---------- EVENT LISTENERS ----------
dom.levelBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        dom.levelBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.level = parseInt(this.dataset.level);
    });
});

dom.startBtn.addEventListener('click', function() {
    const name = dom.name.value.trim();
    if (!name) {
        alert('Masukkan nama terlebih dahulu!');
        return;
    }
    state.name = name;
    dom.headerName.textContent = name;
    dom.headerLevel.textContent = `Level ${state.level}`;
    generateAllQuestions(state.level, name);
});

// ---------- INIT ----------
renderBoxes();
fetchResults();

dom.detailCloseBtn.addEventListener('click', () => hideModal(dom.detailModal));

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            if (this === dom.warningModal || this === dom.questionModal || this === dom.answerModal) return;
            hideModal(this);
        }
    });
});

console.log('Aplikasi Literasi 10 Soal siap!');