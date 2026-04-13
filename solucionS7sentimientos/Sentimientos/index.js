// Importa los módulos necesarios
const Sentiment = require('sentiment');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Crea una instancia de Sentiment
const sentiment = new Sentiment();

//Función que analiza los datos con sentiment y los muestra por consola
function analizar(datos){
    // Analiza el contenido del archivo
    console.log("Datos: "+datos);
    const result = sentiment.analyze(datos);

    // Muestra los resultados del análisis
    console.log("\nResultados del análisis de sentimientos:");
    console.log(`Score: ${result.score}`);
    console.log(`Comparative: ${result.comparative}`);
    console.log("Palabras positivas:", result.positive);
    console.log("Palabras negativas:", result.negative);
}

// Verifica que se haya pasado un argumento para el archivo 
if (process.argv.length < 3) {
    // Configura la entrada del usuario en la consola
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    //Entrada estándar
    console.info("Si desea leer un archivo, introdúzcalo como argumento.");
    console.info("Se utilizará linea de comandos para leer el texto.");
 
    // Pide al usuario que introduzca un texto
    console.log("Introduce un texto para analizar sus sentimientos:");
    
    rl.question('Texto: ', (linea)=>{
        analizar(linea);
        rl.close();
    });
}else{
    //Entrada fichero texto
    // Obtiene la ruta del archivo desde los argumentos
    const filePath = process.argv[2];
    console.info("Se utilizará el fichero "+filePath);
    console.info("Se utilizará linea de comandos para leer el texto.");
    
    // Verifica que el archivo exista
    if (!fs.existsSync(filePath)) {
        console.error("El archivo especificado no existe.");
        process.exit(1);
    }
    // Lee el contenido del archivo
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error al leer el archivo:", err.message);
            process.exit(1);
        }
        analizar(data);       
    });
}