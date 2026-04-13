window.addEventListener("load",function(){
    let img = document.getElementById("imagen");
    let initialDistance = 0;
    let initialAngle = 0;
    let scale = 1;
    let rotation = 0;

    function getDistance(touches) {
        let dx = touches[0].clientX - touches[1].clientX;
        let dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getAngle(touches) {
        let dx = touches[0].clientX - touches[1].clientX;
        let dy = touches[0].clientY - touches[1].clientY;
        return Math.atan2(dy, dx) * (180 / Math.PI);
    }

    img.addEventListener("touchstart", (event) => {
        if (event.touches.length === 2) {
            initialDistance = getDistance(event.touches);
            initialAngle = getAngle(event.touches);
        }
    });

    img.addEventListener("touchmove", (event) => {
        if (event.touches.length === 2) {
            let newDistance = getDistance(event.touches);
            let newAngle = getAngle(event.touches);

            scale *= newDistance / initialDistance;
            rotation += newAngle - initialAngle;

            img.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
            
            initialDistance = newDistance;
            initialAngle = newAngle;
        }
    });

    img.addEventListener("touchend", (event) => {
        if (event.touches.length < 2) {
            initialDistance = 0;
            initialAngle = 0;
        }
    });
});