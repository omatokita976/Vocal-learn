// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Éléments DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const speedRange = document.getElementById('speedRange');
const speedLabel = document.getElementById('speedLabel');
const textPreview = document.getElementById('textPreview');
const status = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');
const fileLoaded = document.getElementById('fileLoaded');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');

let fullText = '';
let speechSegments = [];
let currentIndex = 0;
let isPaused = false;
let isSpeaking = false;
let utterance = null;
let synthesis = window.speechSynthesis;

// Désactiver les boutons au départ
startBtn.disabled = true;
pauseBtn.disabled = true;
stopBtn.disabled = true;
speedRange.disabled = true;

// --- Mise à jour du statut ---
function setStatus(message, type = 'ready') {
  const dot = document.createElement('span');
  dot.className = `status-dot ${type}`;
  status.innerHTML = '';
  status.appendChild(dot);
  status.appendChild(document.createTextNode(' ' + message));
}

setStatus('Prêt à lire', 'ready');

// --- Upload avec vraie progression ---
function uploadFileWithProgress(file) {
  return new Promise((resolve, reject) => {
    uploadProgress.classList.add('active');
    uploadProgressBar.style.width = '0%';
    uploadProgressText.textContent = '0%';

    const reader = new FileReader();

    // Suivi de la progression réelle
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        uploadProgressBar.style.width = percent + '%';
        uploadProgressText.textContent = percent + '%';
      }
    };

    reader.onload = (event) => {
      // Progression à 100%
      uploadProgressBar.style.width = '100%';
      uploadProgressText.textContent = '100%';
      
      setTimeout(() => {
        uploadProgress.classList.remove('active');
        resolve(event.target.result);
      }, 500);
    };

    reader.onerror = (error) => {
      uploadProgress.classList.remove('active');
      reject(error);
    };

    // Lire le fichier comme ArrayBuffer
    reader.readAsArrayBuffer(file);
  });
}

// --- Gestion du fichier PDF ---
async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') {
    setStatus('❌ Veuillez sélectionner un fichier PDF valide.', 'error');
    return;
  }

  // Afficher le nom et la taille
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  fileName.textContent = file.name;
  fileSize.textContent = sizeMB + ' Mo';
  fileLoaded.style.display = 'inline-flex';

  setStatus('⏳ Téléchargement du fichier...', 'loading');

  try {
    // 1. Upload avec vraie progression
    const arrayBuffer = await uploadFileWithProgress(file);
    
    setStatus('⏳ Extraction du texte...', 'loading');

    // 2. Extraction du texte du PDF
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let extracted = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      extracted += strings.join(' ') + '\n\n';
    }

    fullText = extracted.trim();
    if (!fullText) {
      setStatus('⚠️ Aucun texte lisible dans ce PDF.', 'error');
      textPreview.textContent = '(Aucun texte extrait)';
      return;
    }

    textPreview.textContent = fullText;
    setStatus(`✅ ${pdf.numPages} page(s) extraites — ${fullText.length} caractères.`, 'ready');

    // Découpage en segments (phrases)
    speechSegments = fullText.split(/\n{2,}|\.\s+/).filter(s => s.trim().length > 0);
    if (speechSegments.length === 0) {
      speechSegments = [fullText];
    }

    // Réactiver les contrôles
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Start';
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    speedRange.disabled = false;
    currentIndex = 0;
    isPaused = false;
    isSpeaking = false;
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    if (synthesis.speaking) synthesis.cancel();

  } catch (error) {
    console.error(error);
    setStatus('❌ Erreur lors du traitement du PDF.', 'error');
    uploadProgress.classList.remove('active');
  }
}

// --- Sélection du fichier ---
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// --- Synthèse vocale ---
function getSelectedVoice() {
  const isMale = document.querySelector('input[name="voice"]:checked').value === 'male';
  const voices = synthesis.getVoices();
  if (voices.length === 0) return null;

  let lang = 'fr-FR';
  let fallback = 'en-US';

  let preferred = voices.filter(v => v.lang.startsWith(lang));
  if (preferred.length === 0) preferred = voices.filter(v => v.lang.startsWith(fallback));
  if (preferred.length === 0) preferred = voices;

  if (isMale) {
    return preferred.find(v => /male|man|guy|david|pierre|thomas/i.test(v.name)) || preferred[0];
  } else {
    return preferred.find(v => /female|woman|girl|samantha|claire|amelie|marie/i.test(v.name)) || preferred[0];
  }
}

function updateProgress() {
  if (speechSegments.length === 0) return;
  const percent = Math.min(100, Math.round((currentIndex / speechSegments.length) * 100));
  progressFill.style.width = percent + '%';
  progressText.textContent = percent + '%';
}

function speakSegment(index) {
  if (index >= speechSegments.length) {
    setStatus('✅ Lecture terminée !', 'ready');
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Start';
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    isSpeaking = false;
    updateProgress();
    return;
  }

  const text = speechSegments[index];
  if (!text.trim()) {
    speakSegment(index + 1);
    return;
  }

  const voice = getSelectedVoice();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = parseFloat(speedRange.value);
  utterance.pitch = 1.0;
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    if (!isPaused) {
      currentIndex++;
      updateProgress();
      speakSegment(currentIndex);
    }
  };

  utterance.onerror = (err) => {
    console.warn('Erreur vocale:', err);
    setStatus('⚠️ Erreur de synthèse vocale.', 'error');
    isSpeaking = false;
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Start';
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
  };

  synthesis.speak(utterance);
  isSpeaking = true;
  isPaused = false;
  startBtn.disabled = true;
  startBtn.innerHTML = '<span class="btn-icon">▶</span> Lecture...';
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  setStatus(`🔊 Lecture ${index + 1}/${speechSegments.length}`, 'playing');
  updateProgress();
}

// --- Boutons ---
startBtn.addEventListener('click', () => {
  if (speechSegments.length === 0) return;
  if (synthesis.speaking) synthesis.cancel();

  if (isPaused && utterance) {
    isPaused = false;
    synthesis.resume();
    setStatus('▶ Reprise', 'playing');
    startBtn.disabled = true;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Lecture...';
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    return;
  }

  currentIndex = 0;
  isPaused = false;
  speakSegment(currentIndex);
});

pauseBtn.addEventListener('click', () => {
  if (synthesis.speaking && !isPaused) {
    synthesis.pause();
    isPaused = true;
    startBtn.disabled = false;
    startBtn.innerHTML = '<span class="btn-icon">▶</span> Reprendre';
    pauseBtn.disabled = true;
    setStatus('⏸ En pause', 'ready');
  }
});

stopBtn.addEventListener('click', () => {
  synthesis.cancel();
  isSpeaking = false;
  isPaused = false;
  currentIndex = 0;
  startBtn.disabled = false;
  startBtn.innerHTML = '<span class="btn-icon">▶</span> Start';
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  setStatus('⏹ Arrêté', 'ready');
  progressFill.style.width = '0%';
  progressText.textContent = '0%';
});

// --- Vitesse ---
speedRange.addEventListener('input', () => {
  speedLabel.textContent = parseFloat(speedRange.value).toFixed(1) + '×';
});

// --- Initialisation des voix ---
if (synthesis.getVoices().length === 0) {
  synthesis.onvoiceschanged = () => { synthesis.getVoices(); };
}

// --- Réveil des voix au premier clic ---
document.addEventListener('click', () => {
  if (synthesis.getVoices().length === 0) {
    synthesis.getVoices();
  }
}, { once: true });