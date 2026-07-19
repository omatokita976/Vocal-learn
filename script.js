// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Éléments DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const speedRange = document.getElementById('speedRange');
const speedLabel = document.getElementById('speedLabel');
const textPreview = document.getElementById('textPreview');
const status = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const voiceRadios = document.querySelectorAll('input[name="voice"]');

let fullText = '';
let speechSegments = [];
let currentIndex = 0;
let isPaused = false;
let isSpeaking = false;
let utterance = null;
let synthesis = window.speechSynthesis;

// Désactiver les boutons au départ
playBtn.disabled = true;
pauseBtn.disabled = true;
stopBtn.disabled = true;
speedRange.disabled = true;

// --- Gestion du fichier PDF ---
async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') {
    status.textContent = '❌ Veuillez sélectionner un fichier PDF valide.';
    return;
  }

  status.textContent = '⏳ Extraction du texte...';
  const arrayBuffer = await file.arrayBuffer();
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
    status.textContent = '⚠️ Aucun texte lisible dans ce PDF.';
    textPreview.textContent = '(Aucun texte extrait)';
    return;
  }

  textPreview.textContent = fullText;
  status.textContent = `✅ ${pdf.numPages} page(s) extraites — ${fullText.length} caractères.`;

  // Découpage en segments
  speechSegments = fullText.split(/\n{2,}|\.\s+/).filter(s => s.trim().length > 0);
  if (speechSegments.length === 0) {
    speechSegments = [fullText];
  }

  // Réactiver les contrôles
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  speedRange.disabled = false;
  currentIndex = 0;
  isPaused = false;
  isSpeaking = false;
  progressFill.style.width = '0%';
  progressText.textContent = '0%';

  if (synthesis.speaking) synthesis.cancel();
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
  dropZone.style.borderColor = '#7fa3e6';
});
dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = '#3e4d66';
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#3e4d66';
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
    status.textContent = '✅ Lecture terminée !';
    playBtn.disabled = false;
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
    status.textContent = '⚠️ Erreur de synthèse vocale.';
    isSpeaking = false;
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
  };

  synthesis.speak(utterance);
  isSpeaking = true;
  isPaused = false;
  playBtn.disabled = true;
  pauseBtn.disabled = false;
  stopBtn.disabled = false;
  status.textContent = `🔊 Lecture ${index + 1}/${speechSegments.length}`;
  updateProgress();
}

// --- Boutons ---
playBtn.addEventListener('click', () => {
  if (speechSegments.length === 0) return;
  if (synthesis.speaking) synthesis.cancel();

  if (isPaused && utterance) {
    isPaused = false;
    synthesis.resume();
    status.textContent = '▶ Reprise';
    playBtn.disabled = true;
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
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    status.textContent = '⏸ En pause';
  }
});

stopBtn.addEventListener('click', () => {
  synthesis.cancel();
  isSpeaking = false;
  isPaused = false;
  currentIndex = 0;
  playBtn.disabled = false;
  pauseBtn.disabled = true;
  stopBtn.disabled = true;
  status.textContent = '⏹ Arrêté';
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