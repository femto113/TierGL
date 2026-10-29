function export2image(evt) {
    const element = document.getElementById('tableBody');

    const posX = 0;
    const posY = 0;
    const width = elementWidth(element) - elementWidth(document.getElementById('settings'));
    const height = elementHeight(element);

    // Open the tab synchronously, in the same tick as the click, so the
    // browser's popup blocker treats it as user-initiated -- opening it
    // later from inside the .then() below gets blocked in most browsers.
    const previewWindow = window.open('', '_blank');

    html2canvas(element, {
        width: width,
        height: height,
        useCORS: false,
        taintTest: false,
        allowTaint: true,
        scale: 1.0,
        backgroundColor: '#333',
    }).then((canvas) => {
        let context = canvas.getContext('2d');
        let imageData = context.getImageData(posX, posY, width, height).data;
        let outputCanvas = document.createElement('canvas');
        let outputContext = outputCanvas.getContext('2d');
        outputCanvas.width = width;
        outputCanvas.height = height;

        let idata = outputContext.createImageData(width, height);
        idata.data.set(imageData);
        outputContext.putImageData(idata, 0, 0);

        if (previewWindow) {
            previewWindow.location.href = outputCanvas.toDataURL();
        }
    });
}