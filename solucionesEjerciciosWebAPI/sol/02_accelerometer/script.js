const ball = document.getElementById("ball");
const goal = document.getElementById("goal");

let posX = 50; // Posición inicial X (%)
let posY = 50; // Posición inicial Y (%)
const speed = 0.5; // Sensibilidad del movimiento

function updateBallPosition() {
    ball.style.left = `${posX}%`;
    ball.style.top = `${posY}%`;

    // Verificar si la pelota alcanza la meta
    const ballRect = ball.getBoundingClientRect();
    const goalRect = goal.getBoundingClientRect();

    if (
        ballRect.left < goalRect.right &&
        ballRect.right > goalRect.left &&
        ballRect.top < goalRect.bottom &&
        ballRect.bottom > goalRect.top
    ) {
        alert("¡Has alcanzado el objetivo!");
        resetPosition();
    }
}

function resetPosition() {
    posX = 50;
    posY = 50;
    updateBallPosition();
}

async function iniciarAcelerometro() {
    try {
        // Verificar si el sensor está disponible
        if (!("Accelerometer" in window)) {
            alert("Accelerometer API no soportada en este navegador.");
            return;
        }

        // Instanciar el acelerómetro con una frecuencia de actualización de 30 Hz
        let sensor = new Accelerometer({ frequency: 30 });
        sensor.onerror = (event) => {
            console.error("Error en el acelerómetro:", event.error.name);
        };

        sensor.onreading = () => {
            let ax = sensor.x || 0; // Roll (izquierda-derecha)
            let ay = sensor.y || 0; // Pitch (adelante-atrás)

            // Ajustar la posición en función de la inclinación
            posX -= ax * speed;
            posY += ay * speed;

            // Limitar la posición dentro del área de juego
            posX = Math.max(0, Math.min(100, posX));
            posY = Math.max(0, Math.min(100, posY));

            updateBallPosition();
        };

        sensor.start();

        //Para iOS
        // if ("DeviceMotionEvent" in window) {
        //     window.addEventListener("devicemotion", (event) => {
        //         let ax = event.accelerationIncludingGravity.x || 0; // Roll
        //         let ay = event.accelerationIncludingGravity.y || 0; // Pitch

        //         // Ajustar la posición en función de la inclinación
        //         posX -= ax * speed;
        //         posY += ay * speed; 
        
        //         // Limitar la posición dentro del área de juego
        //         posX = Math.max(0, Math.min(100, posX));
        //         posY = Math.max(0, Math.min(100, posY));

        //         updateBallPosition();
        //     });
        // } else {
        //     alert("Tu dispositivo no soporta el acelerómetro.");
        // }
    } catch (error) {
        console.error("Error al iniciar el sensor:", error);
        alert("No se pudo acceder al acelerómetro.");
    }
}

// Pedir permiso en iOS
if (typeof DeviceMotionEvent.requestPermission === "function") {
    document.addEventListener("click", async () => {
        let permiso = await DeviceMotionEvent.requestPermission();
        if (permiso === "granted") {
            iniciarAcelerometro();
        } else {
            alert("Permiso denegado. Actívalo en configuración.");
        }
    });
} else {
    iniciarAcelerometro();
}