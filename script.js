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
let availableVoices = [];

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
  console.log('[Status]', message, type);
}

setStatus('📚 Prêt à lire (PDF, TXT, DOCX, EPUB)', 'ready');

// --- Upload avec vraie progression ---
function uploadFileWithProgress(file) {
  return new Promise((resolve, reject) => {
    uploadProgress.classList.add('active');
    uploadProgressBar.style.width = '0%';
    uploadProgressText.textContent = '0%';

    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        uploadProgressBar.style.width = percent + '%';
        uploadProgressText.textContent = percent + '%';
      }
    };

    reader.onload = (event) => {
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

    reader.readAsArrayBuffer(file);
  });
}

// --- Extraction de texte selon le format ---
async function extractTextFromFile(file, arrayBuffer) {
  const extension = file.name.split('.').pop().toLowerCase();
  let extracted = '';

  switch (extension) {
    case 'pdf':
      return await extractPDFText(arrayBuffer);
    case 'txt':
      return await extractTXTText(arrayBuffer);
    case 'docx':
      return await extractDOCXText(arrayBuffer);
    case 'epub':
      return await extractEPUBText(arrayBuffer);
    default:
      throw new Error(`Format non supporté: ${extension}`);
  }
}

// --- Extraction PDF ---
async function extractPDFText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let extracted = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    extracted += strings.join(' ') + '\n\n';
  }
  
  return extracted;
}

// --- Extraction TXT ---
async function extractTXTText(arrayBuffer) {
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(arrayBuffer);
  return text;
}

// --- Extraction DOCX ---
async function extractDOCXText(arrayBuffer) {
  try {
    const JSZip = window.JSZip;
    if (!JSZip) {
      throw new Error('JSZip non chargé. Vérifie la connexion internet.');
    }
    
    const zip = await JSZip.loadAsync(arrayBuffer);
    let extracted = '';
    
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      const xmlContent = await docFile.async('text');
      const matches = xmlContent.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      extracted = matches.map(m => m.replace(/<[^>]*>/g, '')).join(' ');
    }
    
    if (!extracted.trim()) {
      const files = zip.file(/\.xml$/);
      for (const file of files) {
        const content = await file.async('text');
        const matches = content.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        extracted += matches.map(m => m.replace(/<[^>]*>/g, '')).join(' ');
      }
    }
    
    return extracted;
  } catch (error) {
    console.error('Erreur DOCX:', error);
    throw new Error('Impossible de lire le fichier DOCX');
  }
}

// --- Extraction EPUB ---
async function extractEPUBText(arrayBuffer) {
  try {
    const JSZip = window.JSZip;
    if (!JSZip) {
      throw new Error('JSZip non chargé. Vérifie la connexion internet.');
    }
    
    const zip = await JSZip.loadAsync(arrayBuffer);
    let extracted = '';
    
    const container = await zip.file('META-INF/container.xml').async('text');
    const rootFileMatch = container.match(/full-path="([^"]+\.opf)"/);
    const rootFile = rootFileMatch ? rootFileMatch[1] : 'content.opf';
    
    const opf = await zip.file(rootFile).async('text');
    const hrefMatches = opf.match(/href="([^"]+\.xhtml)"/g) || [];
    const hrefs = hrefMatches.map(m => m.replace(/href="([^"]+)"/, '$1'));
    
    for (const href of hrefs) {
      try {
        const content = await zip.file(href).async('text');
        const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        extracted += text + '\n\n';
      } catch (e) {
        console.warn('Impossible de lire:', href);
      }
    }
    
    return extracted;
  } catch (error) {
    console.error('Erreur EPUB:', error);
    throw new Error('Impossible de lire le fichier EPUB');
  }
}

// --- Chargement des voix ---
function loadVoices() {
  availableVoices = synthesis.getVoices();
  console.log('[Voix] Disponibles:', availableVoices.length);
  
  // Afficher les voix disponibles dans la console
  availableVoices.forEach(v => {
    console.log(`  - ${v.name} (${v.lang}) [${v.localService ? 'local' : 'remote'}]`);
  });
}

// --- Sélection de la voix (MASCULINE vs FEMININE) ---
function getSelectedVoice() {
  const isMale = document.querySelector('input[name="voice"]:checked').value === 'male';
  
  if (availableVoices.length === 0) {
    loadVoices();
  }

  // Voix françaises
  const frenchVoices = availableVoices.filter(v => v.lang.startsWith('fr'));
  
  // Voix anglaises (fallback)
  const englishVoices = availableVoices.filter(v => v.lang.startsWith('en'));
  
  // Toutes les voix disponibles
  const allVoices = frenchVoices.length > 0 ? frenchVoices : englishVoices;
  
  if (allVoices.length === 0) {
    return null;
  }

  // --- VOIX MASCULINE ---
  if (isMale) {
    // Chercher des voix masculines en français
    const maleFrench = allVoices.filter(v => 
      /male|man|guy|david|pierre|thomas|henri|michel|jean|paul|vincent|antoine|sebastien|olivier|philippe|francois|eric|nicolas|christophe|marc|alexandre|m. /i.test(v.name)
    );
    
    if (maleFrench.length > 0) {
      console.log('[Voix] Masculine sélectionnée:', maleFrench[0].name);
      return maleFrench[0];
    }
    
    // Fallback : voix avec pitch bas
    const fallback = allVoices[0];
    console.log('[Voix] Masculine (fallback):', fallback.name);
    return fallback;
  }

  // --- VOIX FEMININE ---
  else {
    // Chercher des voix féminines en français
    const femaleFrench = allVoices.filter(v => 
      /female|woman|girl|samantha|claire|amelie|marie|zira|julie|sophie|emma|chloe|lea|ines|louise|alice|eve|alexia|elodie|madame|mme/i.test(v.name)
    );
    
    if (femaleFrench.length > 0) {
      console.log('[Voix] Féminine sélectionnée:', femaleFrench[0].name);
      return femaleFrench[0];
    }
    
    // Si aucune voix féminine trouvée, prendre la première voix française
    console.log('[Voix] Féminine (fallback):', allVoices[0].name);
    return allVoices[0];
  }
}

// --- Gestion du fichier ---
async function handleFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const supportedFormats = ['pdf', 'txt', 'docx', 'epub'];
  
  if (!supportedFormats.includes(extension)) {
    setStatus(`❌ Format non supporté. Formats acceptés: ${supportedFormats.join(', ')}`, 'error');
    textPreview.textContent = `❌ Le format .${extension} n'est pas supporté.\n\n📚 Formats acceptés :\n- PDF (.pdf)\n- Texte (.txt)\n- Word (.docx)\n- Ebook (.epub)`;
    return;
  }

  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  fileName.textContent = file.name;
  fileSize.textContent = sizeMB + ' Mo';
  fileLoaded.style.display = 'inline-flex';

  setStatus(`⏳ Chargement du fichier .${extension}...`, 'loading');

  try {
    const arrayBuffer = await uploadFileWithProgress(file);
    setStatus(`⏳ Extraction du texte (${extension.toUpperCase()})...`, 'loading');

    const extracted = await extractTextFromFile(file, arrayBuffer);
    fullText = extracted.trim();
    
    console.log(`[${extension.toUpperCase()}] Texte extrait:`, fullText.substring(0, 200) + '...');
    console.log(`[${extension.toUpperCase()}] Longueur:`, fullText.length);

    if (!fullText || fullText.length < 5) {
      setStatus(`⚠️ Aucun texte lisible dans ce fichier .${extension}`, 'error');
      textPreview.textContent = `❌ Aucun texte n'a pu être extrait de ce fichier .${extension}.\n\nVérifie que le fichier n'est pas corrompu ou protégé.`;
      startBtn.disabled = true;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      return;
    }

    textPreview.textContent = fullText;
    setStatus(`✅ ${fullText.length} caractères extraits du fichier .${extension}`, 'ready');

    speechSegments = fullText.split(/\n{2,}|\.\s+|\.\n/).filter(s => s.trim().length > 10);
    
    if (speechSegments.length < 2) {
      speechSegments = fullText.split(/\n{2,}/).filter(s => s.trim().length > 10);
    }
    
    if (speechSegments.length === 0) {
      speechSegments = [fullText];
    }
    
    console.log('[Segments] Créés:', speechSegments.length);

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
    console.error('[ERREUR]', error);
    setStatus(`❌ Erreur: ${error.message}`, 'error');
    textPreview.textContent = `❌ Erreur lors du traitement: ${error.message}\n\nVérifie que le fichier n'est pas corrompu.`;
    uploadProgress.classList.remove('active');
    startBtn.disabled = true;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
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
  if (!text || text.trim().length < 3) {
    currentIndex++;
    speakSegment(currentIndex);
    return;
  }

  const voice = getSelectedVoice();
  utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = parseFloat(speedRange.value);
  utterance.pitch = 1.0;
  
  // Appliquer la voix sélectionnée
  if (voice) {
    utterance.voice = voice;
    console.log('[Lecture] Voix utilisée:', voice.name);
  }

  utterance.onend = () => {
    if (!isPaused) {
      currentIndex++;
      updateProgress();
      speakSegment(currentIndex);
    }
  };

  utterance.onerror = (err) => {
    console.warn('Erreur vocale:', err);
    setStatus(`⚠️ Erreur de synthèse vocale`, 'error');
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

function updateProgress() {
  if (speechSegments.length === 0) return;
  const percent = Math.min(100, Math.round((currentIndex / speechSegments.length) * 100));
  progressFill.style.width = percent + '%';
  progressText.textContent = percent + '%';
}

// --- Boutons ---
startBtn.addEventListener('click', () => {
  console.log('[Start] Clic - segments:', speechSegments.length);
  
  if (speechSegments.length === 0) {
    setStatus('⚠️ Aucun texte à lire. Charge d\'abord un fichier valide.', 'error');
    return;
  }
  
  if (synthesis.speaking) {
    synthesis.cancel();
  }

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
  console.log('[Pause] Clic');
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
  console.log('[Stop] Clic');
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
  synthesis.onvoiceschanged = () => { 
    loadVoices();
  };
} else {
  loadVoices();
}

// --- Réveil des voix au premier clic ---
document.addEventListener('click', () => {
  if (synthesis.getVoices().length === 0) {
    loadVoices();
  }
}, { once: true });

console.log('📖 Vocal Learn chargé - Formats supportés: PDF, TXT, DOCX, EPUB');