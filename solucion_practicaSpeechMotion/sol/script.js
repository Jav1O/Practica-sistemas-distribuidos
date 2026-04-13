const videoEl = document.querySelector("#video");
const logEl = document.querySelector("#log");

const SpeechRecognition =
  window.SpeechRecognition || webkitSpeechRecognition;
const SpeechGrammarList =
  window.SpeechGrammarList || webkitSpeechGrammarList;

//Función para dar retroalimentación por voz
function speak(text) {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-ES";
    synth.speak(utterance);
}

//Reconocimiento de voz
function startRecognition() {
    //window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    const speechRecognitionList = new SpeechGrammarList();

    const grammar = `#JSGF V1.0; grammar comandos; public <comando> = reproducir | pausar | subir volumen | bajar volumen | ayuda ;`;
    speechRecognitionList.addFromString(grammar, 1);
    recognition.grammars = speechRecognitionList;
    recognition.lang = "es-ES";
    recognition.start();

    recognition.onresult = (event) => {
        let command = event.results[0][0].transcript.toLowerCase();
        logEl.innerText = `Comando detectado: "${command}"`;
        handleCommand(command);
    };

    recognition.onerror = () => {
        logEl.innerText = "No se pudo reconocer el comando.";
        speak("No entendí el comando. Intenta de nuevo.");
    };
}

//Manejo de comandos de voz
function handleCommand(command) {
    if (command.includes("reproducir")) {
        videoEl.play();
        speak("Reproduciendo video.");
    } else if (command.includes("pausar")) {
        videoEl.pause();
        speak("Video pausado.");
    } else if (command.includes("subir volumen")) {
        videoEl.volume = Math.min(1, videoEl.volume + 0.1);
        speak("Subiendo volumen.");
    } else if (command.includes("bajar volumen")) {
        videoEl.volume = Math.max(0, videoEl.volume - 0.1);
        speak("Bajando volumen.");
    } else if (command.includes("ayuda")) {
        speak("Puedes decir: Reproducir, Pausar, Subir volumen, Bajar volumen.");
    } else {
        status.innerText = "Comando no reconocido.";
        speak("No entendí el comando. Prueba con Reproducir, Pausar o Ayuda.");
    }
}

//Control por gestos con Acelerómetro
if ("Accelerometer" in window) {
    try {
        const sensor = new Accelerometer({ frequency: 60 });

        let lastMoveTime = 0;
        const MOVE_THRESHOLD = 30;  // Sensibilidad del movimiento
        const MOVE_DELAY = 2000;  // Evita múltiples activaciones seguidas

        sensor.onreading = () => {
            const now = performance.now();
            const pitch = Math.asin(2.0 * sensor.x / 9.8) * (180 / Math.PI); // Convertir a grados

            if (pitch > MOVE_THRESHOLD && now - lastMoveTime > MOVE_DELAY) {
                videoEl.currentTime += 5;
                logEl.innerText = "Avanzando 5s...";
                speak("Avanzando 5 segundos.");
                lastMoveTime = now;
            } else if (pitch < -MOVE_THRESHOLD && now - lastMoveTime > MOVE_DELAY) {
                videoEl.currentTime -= 5;
                logEl.innerText = "Retrocediendo 5s...";
                speak("Retrocediendo 5 segundos.");
                lastMoveTime = now;
            }
        };

        sensor.start();
    } catch (error) {
        console.error("Error con el acelerómetro:", error);
        logEl.innerText = "El Acelerómetro no está disponible en este dispositivo.";
    }
} else {
    console.error("Accelerometer API no soportada.");
    logEl.innerText = "Tu navegador no soporta el Acelerómetro.";
}