// ====================================================
//  APLIKASI LITERASI – FRONTEND LOGIC
//  Menggunakan server lokal (Ollama) via ngrok untuk AI
//  Penyimpanan hasil ke Google Apps Script
//  Fitur: Tombol "Selesai Membaca" aktif setelah 3 detik
//  Fitur: Tampilkan hari/tanggal pada hasil pekerjaan
//  Fitur: Tema acak (finansial, lingkungan, digital, kesehatan)
//  Fitur: Batasan kata jawaban sesuai level
// ====================================================

// ---------- KONFIGURASI ----------
const CONFIG = {
    // URL untuk generate & evaluate (server lokal melalui ngrok)
    API_URL: 'https://cardigan-unmixed-saddled.ngrok-free.dev', // GANTI DENGAN URL NGROK ANDA

    // URL untuk menyimpan dan mengambil hasil (Google Apps Script)
    SHEET_URL: 'https://script.google.com/macros/s/AKfycbxYoqc7oHFiKw8VmPrXRcSNzWRK4t7vn8zO15pBSOWX3jKwXCuFr1WRKaAwl4JsA37srw/exec',

    // Tema yang tersedia (akan dipilih acak)
    THEMES: [
        'finansial dan kewirausahaan',
        'isu lingkungan dan perubahan iklim',
        'digital dan media sosial',
        'kesehatan dan gaya hidup'
    ]
};

// ---------- STATE ----------
const state = {
    name: '',
    level: 2,
    questions: [],
    currentBox: null,
    boxesStatus: [],
    scores: [],
    timerInterval: null,
    countdownInterval: null,
    isAnswering: false,
    isReading: false,
    recognition: null,
    currentQuestionIndex: -1,
    results: [],
    readFinishTimeout: null,
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
        1: { timeRead: 5 * 60, timeWrite: 3 * 60, wordCount: '150-250', maxAnswerWords: 25, questionCount: 1 },
        2: { timeRead: 10 * 60, timeWrite: 5 * 60, wordCount: '300-400', maxAnswerWords: 50, questionCount: 1 },
        3: { timeRead: 15 * 60, timeWrite: 7 * 60, wordCount: '700-900', maxAnswerWords: 75, questionCount: 1 }
    };
    return configs[level];
}

// ---------- GENERATE SOAL VIA SERVER LOKAL ----------
async function fetchQuestions(level, name) {
    dom.loading.style.display = 'block';
    dom.startBtn.disabled = true;
    try {
        const payload = { action: 'generateQuestions', level, name };
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.status === 'success' && data.questions) {
            state.questions = data.questions;
            const total = state.questions.length;
            state.boxesStatus = new Array(total).fill('white');
            state.scores = new Array(total).fill(null);
            renderBoxes();
            alert(`Soal berhasil dibuat! (${total} soal) Klik kotak putih untuk mulai mengerjakan.`);
        } else {
            alert('Gagal membuat soal: ' + (data.message || ''));
        }
    } catch (e) {
        console.error(e);
        alert('Gagal membuat soal: ' + e.message);
    } finally {
        dom.loading.style.display = 'none';
        dom.startBtn.disabled = false;
    }
}

// ---------- EVALUASI JAWABAN VIA SERVER LOKAL ----------
async function evaluateAnswerViaAI(question, answer, level) {
    const payload = {
        action: 'evaluateAnswer',
        level,
        question,
        answer,
        name: state.name
    };
    const response = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === 'success') {
        return {
            score: data.score,
            comment: data.comment,
            expected_idea: data.expected_idea || 'Tidak tersedia'
        };
    } else {
        throw new Error(data.message || 'Gagal mengevaluasi');
    }
}

// ---------- RENDER BOXES ----------
function renderBoxes() {
    const grid = dom.boxesGrid;
    grid.innerHTML = '';
    const total = state.questions.length || state.boxesStatus.length;
    for (let i = 0; i < total; i++) {
        const box = document.createElement('div');
        const status = state.boxesStatus[i] || 'white';
        box.className = `box-item status-${status}`;
        if (status !== 'white') box.classList.add('disabled');
        box.dataset.index = i;
        box.innerHTML = `
            <span class="box-number">${i+1}</span>
            <span class="box-status">${status === 'white' ? '● siap' : status === 'green' ? '✓ selesai' : '◉ dibuka'}</span>
        `;
        if (status === 'white') {
            box.addEventListener('click', () => handleBoxClick(i));
        }
        grid.appendChild(box);
    }
    updateProgress();
}

function updateProgress() {
    const done = state.boxesStatus.filter(s => s === 'green').length;
    const total = state.boxesStatus.length;
    dom.progressText.textContent = `${done} / ${total} selesai`;
    const totalScore = state.scores.reduce((a,b) => a + (b || 0), 0);
    dom.totalScoreValue.textContent = totalScore;
}

// ---------- KOMUNIKASI KE APPS SCRIPT (penyimpanan) ----------
async function postToScript(payload) {
    const formData = new FormData();
    formData.append('data', JSON.stringify(payload));
    const response = await fetch(CONFIG.SHEET_URL, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

// ---------- HANDLE KLIK KOTAK ----------
function handleBoxClick(index) {
    if (state.boxesStatus[index] !== 'white') return;
    if (!state.questions || state.questions.length === 0) {
        alert('Belum ada soal. Klik "Mulai Kerjakan" dulu!');
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

// ---------- MODAL JAWAB (MENULIS + VOICE) ----------
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
                dom.voiceStatus.textContent = 'Rekaman berhenti. Klik mikrofon lagi untuk melanjutkan.';
            };
        } else {
            dom.voiceBtn.style.display = 'none';
            dom.voiceStatus.textContent = 'Voice recognition tidak didukung browser ini.';
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
            dom.voiceStatus.textContent = 'Merekam... bicaralah dengan jelas.';
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

// ---------- SIMPAN JAWABAN ----------
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
    dom.loading.style.display = 'block';
    try {
        const result = await evaluateAnswerViaAI(q.text, answer, state.level);
        const score = result.score;
        state.scores[index] = score;
        state.boxesStatus[index] = 'green';
        q.answer = answer;
        q.score = score;
        renderBoxes();
        dom.scoreNumber.textContent = score;
        dom.scoreComment.textContent = result.comment;
        dom.expectedIdeaText.textContent = result.expected_idea;
        showModal(dom.scoreModal);
        dom.scoreCloseBtn.onclick = function() {
            hideModal(dom.scoreModal);
            // Simpan ke Google Sheet
            try {
                const payload = {
                    action: 'saveResult',
                    name: state.name,
                    level: state.level,
                    question: q.text,
                    answer: answer,
                    score: score,
                    comment: result.comment,
                    expected_idea: result.expected_idea
                };
                postToScript(payload).then(() => {
                    fetchResults();
                }).catch(err => console.warn('Gagal menyimpan ke sheet:', err));
            } catch (e) {
                console.warn('Gagal menyimpan ke sheet:', e);
            }
            fetchResults();
        };
        updateProgress();
    } catch (e) {
        console.error(e);
        alert('Gagal menganalisis jawaban: ' + e.message);
        state.boxesStatus[index] = 'white';
        renderBoxes();
    } finally {
        dom.loading.style.display = 'none';
    }
}

// ---------- FETCH HASIL DARI SHEET ----------
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

// ---------- RENDER HASIL (dengan hari/tanggal) ----------
function renderResults() {
    const list = dom.resultsList;
    list.innerHTML = '';
    if (!state.results || state.results.length === 0) {
        list.innerHTML = '<p class="empty-msg">Belum ada hasil. Kerjakan soal dulu ya!</p>';
        return;
    }
    state.results.slice().reverse().forEach(row => {
        const div = document.createElement('div');
        div.className = 'result-item';
        let waktuDisplay = row.waktu || '-';
        div.innerHTML = `
            <span class="r-name">${row.name || 'Anonim'} (${row.level || '-'})</span>
            <span class="r-score">${row.score || 0} / 10</span>
            <span class="r-time">${waktuDisplay}</span>
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
    fetchQuestions(state.level, name);
});

// ---------- INIT ----------
renderBoxes();
fetchResults();

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            if (this === dom.warningModal || this === dom.questionModal || this === dom.answerModal) return;
            hideModal(this);
        }
    });
});

console.log('Aplikasi Literasi siap! (Server lokal via ngrok)');