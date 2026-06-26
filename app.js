// ====================================================
//  APLIKASI LITERASI – FRONTEND LOGIC
//  Menggunakan Groq API (fallback multiple API keys)
//  Fitur: Tombol "Selesai Membaca" aktif setelah 3 detik
//  Fitur: Tampilkan hari/tanggal pada hasil pekerjaan
// ====================================================

// ---------- KONFIGURASI ----------
const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxYoqc7oHFiKw8VmPrXRcSNzWRK4t7vn8zO15pBSOWX3jKwXCuFr1WRKaAwl4JsA37srw/exec',
    GROQ_API_KEYS: [
        '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', // Key 1
        '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', // Ganti dengan Key 2
        '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'      // Ganti dengan Key 3
    ],
    GROQ_URL: 'https://api.groq.com/openai/v1/chat/completions',
    GROQ_MODEL: 'llama-3.3-70b-versatile' // atau 'mixtral-8x7b-32768'
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
        1: { timeRead: 5 * 60, timeWrite: 3 * 60, wordCount: '150-250', answerLen: '20-30', questionCount: 1 },
        2: { timeRead: 10 * 60, timeWrite: 5 * 60, wordCount: '400-500', answerLen: '50-60', questionCount: 1 },
        3: { timeRead: 15 * 60, timeWrite: 7 * 60, wordCount: '700-900', answerLen: '80-100', questionCount: 1 }
    };
    return configs[level];
}

// ---------- GROQ API DENGAN FALLBACK MULTI-KEY ----------
async function askGroq(prompt, maxRetriesPerKey = 2) {
    const keys = CONFIG.GROQ_API_KEYS.filter(k => k && k.startsWith('gsk_'));
    if (keys.length === 0) {
        throw new Error('Tidak ada API key Groq yang valid. Periksa konfigurasi.');
    }

    let lastError = null;
    // Loop melalui setiap key
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        const apiKey = keys[keyIndex];
        console.log(`Mencoba dengan API Key #${keyIndex + 1}...`);

        for (let attempt = 1; attempt <= maxRetriesPerKey; attempt++) {
            try {
                const response = await fetch(CONFIG.GROQ_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: CONFIG.GROQ_MODEL,
                        messages: [
                            { role: 'system', content: 'Kamu adalah asisten AI yang membantu dalam pendidikan literasi. Selalu berikan jawaban dalam format JSON yang valid tanpa markdown pembungkus.' },
                            { role: 'user', content: prompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 4096,
                        response_format: { type: 'json_object' }
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    let errorMsg = `HTTP ${response.status}`;
                    try {
                        const errJson = JSON.parse(text);
                        if (errJson.error && errJson.error.message) {
                            errorMsg += `: ${errJson.error.message}`;
                        } else {
                            errorMsg += `: ${text}`;
                        }
                    } catch (e) {
                        errorMsg += `: ${text}`;
                    }
                    // Jika error 401 atau 429, kita anggap key ini tidak valid/terbatas, lanjut ke key berikutnya
                    if (response.status === 401 || response.status === 429) {
                        throw new Error(errorMsg); // akan ditangkap di catch dan lanjut ke key berikutnya
                    }
                    throw new Error(errorMsg);
                }

                const data = await response.json();
                const content = data.choices?.[0]?.message?.content;
                if (!content) throw new Error('Respons tidak memiliki konten');

                // Validasi JSON
                try {
                    JSON.parse(content);
                    return content; // Berhasil
                } catch (e) {
                    // Coba ekstrak JSON dari markdown
                    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
                    if (jsonMatch) {
                        const jsonStr = jsonMatch[1];
                        JSON.parse(jsonStr);
                        return jsonStr;
                    }
                    throw new Error('Respons bukan JSON yang valid: ' + content);
                }
            } catch (e) {
                lastError = e;
                console.warn(`Key #${keyIndex+1}, percobaan ${attempt} gagal:`, e.message);
                if (attempt < maxRetriesPerKey) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
                // Jika percobaan habis untuk key ini, kita akan keluar dari loop percobaan dan lanjut ke key berikutnya
            }
        }
        // Jika sampai sini, berarti key ini gagal setelah maxRetriesPerKey, lanjut ke key berikutnya
        console.warn(`API Key #${keyIndex+1} gagal setelah ${maxRetriesPerKey} percobaan. Beralih ke key berikutnya...`);
    }

    // Jika semua key gagal
    throw new Error('Semua API key Groq gagal setelah percobaan. ' + (lastError ? lastError.message : ''));
}

// ---------- GENERATE SOAL VIA GROQ ----------
async function fetchQuestions(level, name) {
    dom.loading.style.display = 'block';
    dom.startBtn.disabled = true;
    try {
        const cfg = getLevelConfig(level);
        const promptJson = `Buatkan 1 bacaan/cerita pendek untuk anak SMP level ${level}. 
Bacaan harus memiliki panjang sekitar ${cfg.wordCount} kata. 
Tema bisa sains, kehidupan sehari-hari, alam, sejarah, atau lainnya. 
Bacaan harus informatif, menarik, dan memiliki alur cerita yang jelas.
Output dalam format JSON: {"text": "isi bacaan lengkap"}. Hanya output JSON.`;

        const response = await askGroq(promptJson);
        const parsed = JSON.parse(response);
        const text = parsed.text;
        if (!text || text.length < 50) {
            throw new Error('Respons AI terlalu pendek atau kosong.');
        }

        state.questions = [{
            id: 0,
            text: text,
            timeRead: cfg.timeRead,
            timeWrite: cfg.timeWrite,
            answer: null,
            score: null
        }];
        const total = state.questions.length;
        state.boxesStatus = new Array(total).fill('white');
        state.scores = new Array(total).fill(null);
        renderBoxes();
        alert(`Soal berhasil dibuat! (${total} soal) Klik kotak putih untuk mulai mengerjakan.`);
    } catch (e) {
        console.error(e);
        alert('Gagal membuat soal: ' + e.message);
    } finally {
        dom.loading.style.display = 'none';
        dom.startBtn.disabled = false;
    }
}

// ---------- EVALUASI JAWABAN VIA GROQ ----------
async function evaluateAnswerViaAI(question, answer, level) {
    const prompt = `Berikut adalah sebuah bacaan dan ringkasan/ide pokok yang ditulis oleh siswa.

Bacaan:
${question}

Ringkasan/Ide Pokok siswa:
${answer}

Tugasmu: 
1. Bandingkan ringkasan siswa dengan isi bacaan. 
2. Nilai seberapa baik siswa menangkap ide pokok dan informasi penting dari bacaan.
3. Berikan skor 1-10 (10 = sangat baik, menangkap semua ide pokok dengan tepat).
4. Berikan komentar singkat (2-3 kalimat) yang membangun untuk siswa.
5. Tuliskan ide pokok yang SEHARUSNYA dari bacaan tersebut (dalam 1-2 kalimat).

Output dalam format JSON: 
{"score": angka (1-10), "comment": "komentar", "expected_idea": "ide pokok yang diharapkan"}. 
Hanya output JSON, tanpa teks tambahan.`;

    const response = await askGroq(prompt);
    const parsed = JSON.parse(response);
    return {
        score: parsed.score || 5,
        comment: parsed.comment || 'Analisis tidak tersedia.',
        expected_idea: parsed.expected_idea || 'Tidak tersedia'
    };
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
    const response = await fetch(CONFIG.SCRIPT_URL, {
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
        const resp = await fetch(CONFIG.SCRIPT_URL + '?action=getResults');
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

console.log('Aplikasi Literasi siap! (Groq API dengan fallback multi-key, model ' + CONFIG.GROQ_MODEL + ')');