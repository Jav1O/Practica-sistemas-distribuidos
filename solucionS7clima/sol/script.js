document.querySelector("#speak-btn").addEventListener("click", startRecognition);

function startRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.start();

    recognition.onresult = (event) => {
        let transcript = event.results[0][0].transcript.toLowerCase();
        console.log("Reconocido:", transcript);
        
        if (transcript.includes("clima")) {
            getLocation();
        } else {
            alert("Di '¿Cuál es el clima?' para obtener el tiempo.");
        }
    };

    recognition.onerror = () => {
        alert("No se pudo reconocer el comando. Intenta de nuevo.");
    };
}

function getLocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                document.getElementById("location").innerText = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                getWeather(lat, lon);
            },
            (error) => {
                alert("Error obteniendo la ubicación: " + error.message);
            }
        );
    } else {
        alert("Tu navegador no soporta la geolocalización.");
    }
}

function getWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error("Error en la API");
            }
            return response.json();
        })
        .then(data => {
            document.getElementById("temperature").innerText = data.current_weather.temperature;
            document.getElementById("wind").innerText = data.current_weather.windspeed;
        })
        .catch(error => {
            alert("Hubo un error al obtener el clima.");
            console.error(error);
        });
}