const fs = require('fs');
const path = require('path');

// INSERISCI QUI IL PERCORSO COMPLETO O RELATIVO DEL FILE DA ELIMINARE
const targetFilePath = path.join(__dirname, 'boost.txt');

console.log(`[Monitoraggio Continuo Avviato] Controllo attivo su: ${targetFilePath}`);

const deleteFile = () => {
    // Verifica se il file esiste
    if (fs.existsSync(targetFilePath)) {
        try {
            // Elimina il file
            fs.unlinkSync(targetFilePath);
            console.log(`[${new Date().toLocaleTimeString()}] File rigenerato ed eliminato istantaneamente.`);
        } catch (err) {
            // Se il file è bloccato (l'applicazione lo sta ancora scrivendo), 
            // ignora l'errore: verrà riprovato al prossimo ciclo di 100ms
            if (err.code !== 'EBUSY' && err.code !== 'EPERM') {
                console.error(`[Errore Imprevisto] Impossibile eliminare: ${err.message}`);
            }
        }
    }
};

// Esegue il controllo di eliminazione ogni 100 millisecondi all'infinito
setInterval(deleteFile, 100);