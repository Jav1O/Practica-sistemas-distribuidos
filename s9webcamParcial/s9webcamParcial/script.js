import {
    FilesetResolver,
    PoseLandmarker,
  } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

  
window.addEventListener("load",()=>{
  let estado=-1;
  let flexiones=0;
  const pFlexiones = document.querySelector("#flexiones");


  const select = document.getElementById('deviceSelect');
  const permisos = document.getElementById('permissionButton');
  const cargar = document.getElementById('camaras');
  const iniciarB = document.getElementById('iniciar');
  cargar.addEventListener("click",populateDeviceSelect);
  iniciarB.addEventListener("click",iniciar);
  permisos.addEventListener("click",requestPermissions);

  async function requestPermissions() {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      populateDeviceSelect();
    } catch (err) {
      console.error(`${err.name}: ${err.message}`);
    }
  }

  async function populateDeviceSelect() {
    select.innerHTML="";
    
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
  
      devices.forEach((device) => {
        if (device.kind === 'videoinput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.text = `${device.kind}: ${device.label}`;
          console.log(option.text);
          select.appendChild(option);
        }
      });
    } catch (err) {
      console.error(`${err.name}: ${err.message}`);
    }
  }

  populateDeviceSelect();

  async function iniciar() {
    
    //const videoElement = document.querySelector("#video");
    const videoElement = document.querySelector("#webcam");

    try {
      
      //const select1 = document.getElementById('deviceSelect');
        const deviceIdS = select.value;
        const constraints = {
          video: true,
            
           video: {
               facingMode: 'environment',
               width: { ideal: 1280 },
               height: { ideal: 720 }
           },
           video: { deviceId: deviceIdS },
          audio: false,
      };
      console.log(constraints);
        //const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceIdS } });
      const currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = currentStream;
    } catch (err) {
      console.error('Error accessing camera:', err);
    }

    

  
    const children = [];
    const canvas = document.querySelector("canvas");
    const camerabbox = videoElement.getBoundingClientRect();
    canvas.style.top = camerabbox.y + "px";
    canvas.style.left = camerabbox.x + "px";
    const context = canvas.getContext("2d");

    const WIDTH = 640;
    const HEIGHT = 360;

    const runningMode = "VIDEO";
    const vision = await FilesetResolver.forVisionTasks(
      // path/to/wasm/root
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: runningMode,
      numPoses: 1,
    });

    console.log(poseLandmarker);

    videoElement.readyState > 2 
      ? predictWebcam()
      : videoElement.addEventListener("loadeddata", async () => {
          console.log('Video loaded');
          predictWebcam();
          //videoElement.play();
      });

    /*
    //Para video - No webcam
    videoElement.readyState > 2 
      ? predictVideo()
      : videoElement.addEventListener("loadeddata", async () => {
          console.log('Video loaded');
          predictVideo();
          //videoElement.play();
      });

      async function predictVideo() {
        // if image mode is initialized, create a new classifier with video runningMode.
    
        let startTimeMs = performance.now();
    
        // Detect objects using detectForVideo.
        
          const detections = poseLandmarker.detectForVideo(
            videoElement,
            startTimeMs
          );
          console.log(detections);
          displayVideoDetections(detections);
    
          // Call this function again to keep predicting when the browser is ready.
          requestAnimationFrame(predictVideo);
        
      }
    */

      async function predictWebcam() {
        let startTimeMs = performance.now();
        // Detect objects using detectForVideo.
        try {
          const detections = poseLandmarker.detectForVideo(
            videoElement,
            startTimeMs
          );
          displayVideoDetections(detections);
      
          // Call this function again to keep predicting when the browser is ready.
          requestAnimationFrame(predictWebcam);
        } catch (error) {
          console.log("Cannot predict from this camera. "+error);
        }
      }
    
      function displayVideoDetections(result) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        drawPoseLandmarks(context, result.landmarks[0]);
      }
    
    
    
      function drawPoseLandmarks(context, landmarks) {
        if (!landmarks) return;
        const color = "red";
        // Define the connections between landmarks (bones of the hand)
        const connections = [
          [12, 11],
          [12, 14],[14, 16],[16, 22],[16, 18], [18, 20],
          [11, 13],[13, 15],[15, 21],[15, 17], [17, 19], 
          [12, 24],[24, 26],[26, 28],
          [11, 23],[23, 25],[25, 25],
        ];

        // Aquí deberás calcular las distancias y ángulos a partir de los 
        // puntos (landmarks) más relevantes
        // Dispones de funciones auxiliares para calcular ángulos y distancias entre puntos, pero puedes crear las tuyas propias si lo consideras necesario.
        //También se crea texto con el número del punto para facilitar la identificación de cada uno de ellos.
        
        //Se deja ejemplo de detección de la flexión derecha (Mayor que 30 arriba - menor que 8 abajo)
        //32 (Pie) - 12 (hombro) - Proyección de hombro a altura pie (función creada) 
        
        //Ángulos relevantes
        let anguloflexion = getAngleBetween2Points(landmarks[12],landmarks[32]);
        
        console.log(anguloflexion);
        
        
        pFlexiones.innerHTML="Aquí contaría las Flexiones";
        //console.log(flexiones);
        

    
        // Draw lines for each connection
        connections.forEach(([start, end]) => {
          const startPoint = landmarks[start];
          const endPoint = landmarks[end];
          context.beginPath();
          context.moveTo(startPoint.x * WIDTH, startPoint.y * HEIGHT); // Move to the start landmark
          context.lineTo(endPoint.x * WIDTH, endPoint.y * HEIGHT); // Draw to the end landmark
          context.lineWidth = 2;
          context.strokeStyle = "blue";
          context.stroke();
        });
    
        // Draw circles for each landmark
        landmarks.forEach((landmark,i) => {
          drawCircle(context, landmark.x * WIDTH, landmark.y * HEIGHT, 3, color);
          drawPoint(context, i, landmark.x * WIDTH, landmark.y * HEIGHT);
        });
      }
    
      function drawCircle(context, cx, cy, radius, color) {
        context.beginPath();
        context.arc(cx, cy, radius, 0, 2 * Math.PI, false);
        context.fillStyle = "red";
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = color;
        context.stroke();
      }

      function drawPoint(context, index, cx, cy){
        context.font = "24px serif";
        context.fillText(index, cx+10, cy);

      }

      function drawNumber(context, index, cx, cy){
        context.font = "24px serif";
        context.fillText(index, cx+10, cy);
  
      }
  
      function getAngleBetweenPoints(a, b, c) {
        // Vectores: BA y BC
        const v1 = {
          x: a.x - b.x, y: a.y - b.y, z: a.z - b.z
        };
        const v2 = {
          x: c.x - b.x, y: c.y - b.y, z: c.z - b.z
        };
        // Producto punto (dot product)
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        // Magnitudes
        const mag1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
        const mag2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);
        const cosTheta = dot / (mag1 * mag2);
        // Asegurar que el valor esté dentro del rango [-1, 1] por precisión numérica
        const clamped = Math.max(-1, Math.min(1, cosTheta));
        // Ángulo en radianes → convertir a grados
        const angleRad = Math.acos(clamped);
        const angleDeg = angleRad * (180 / Math.PI);
        return angleDeg;
       }
  
       function getHeightBetweenPoints(a, b){
          return a.y - b.y;
       }
  
       function getAngleBetween2Points(a, b){
        // Vectores: BA y BC
        const c = {x:a.x,y:b.y,z:a.z};
        const v1 = {
          x: a.x - b.x, y: a.y - b.y, z: a.z - b.z
        };
        const v2 = {
          x: c.x - b.x, y: c.y - b.y, z: c.z - b.z
        };
        // Producto punto (dot product)
        const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
        // Magnitudes
        const mag1 = Math.sqrt(v1.x**2 + v1.y**2 + v1.z**2);
        const mag2 = Math.sqrt(v2.x**2 + v2.y**2 + v2.z**2);
        const cosTheta = dot / (mag1 * mag2);
        // Asegurar que el valor esté dentro del rango [-1, 1] por precisión numérica
        const clamped = Math.max(-1, Math.min(1, cosTheta));
        // Ángulo en radianes → convertir a grados
        const angleRad = Math.acos(clamped);
        const angleDeg = angleRad * (180 / Math.PI);
        return angleDeg;
       }

  }


});



