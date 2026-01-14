// Global state management
const appState = {
    isRecording: false,
    isPaused: false,
    transcript: '',
    notes: '',
    chatGPTResponse: '',
    startTime: null,
    responseTime: 0,
    mediaRecorder: null,
    audioContext: null,
    processorNode: null,
    ws: null
};

// Recording functions
function startRecording() {
    try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true 
            } 
        });

        appState.isRecording = true;
        appState.isPaused = false;
        appState.startTime = Date.now();
        
        document.getElementById('recordingIndicator').classList.remove('hidden');
        document.getElementById('startRecordBtn').disabled = true;
        document.getElementById('pauseRecordBtn').disabled = false;
        document.getElementById('resumeRecordBtn').hidden = true;
        
        // Initialize Web Audio API
        appState.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });

        const source = appState.audioContext.createMediaStreamSource(stream);
        
        // Create ScriptProcessor for real-time audio processing
        appState.processorNode = appState.audioContext.createScriptProcessor(800, 1, 1);

        source.connect(appState.processorNode);
        appState.processorNode.connect(appState.audioContext.destination);

        // Connect to backend WebSocket
        connectToBackend();

        // Handle audio processing
        appState.processorNode.onaudioprocess = (event) => {
            if (appState.isRecording && !appState.isPaused) {
                const audioData = event.inputBuffer.getChannelData(0);
                
                // Convert float32 to int16
                const int16Data = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    int16Data[i] = Math.max(-1, Math.min(1, audioData[i])) < 0 
                        ? audioData[i] * 0x8000 
                        : audioData[i] * 0x7FFF;
                }

                // Send to backend
                if (appState.ws && appState.ws.readyState === WebSocket.OPEN) {
                    appState.ws.send(int16Data.buffer);
                }
            }
        };

    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Unable to access microphone. Please check permissions.');
        document.getElementById('startRecordBtn').disabled = false;
        appState.isRecording = false;
    }
}

function connectToBackend() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    appState.ws = new WebSocket(`${protocol}//${window.location.host}/ws/transcribe`);
    
    appState.ws.binaryType = 'arraybuffer';
    
    appState.ws.onopen = () => {
        console.log('Connected to backend for transcription');
    };

    appState.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'transcript') {
                appState.transcript = data.text;
                document.getElementById('transcriptText').value = appState.transcript;
            }
        } catch (error) {
            console.error('Error handling transcription message:', error);
        }
    };

    appState.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        alert('Connection error. Please try again.');
    };

    appState.ws.onclose = () => {
        console.log('Disconnected from backend');
    };
}

function pauseRecording() {
    appState.isPaused = true;
    appState.isRecording = false;
    
    if (appState.audioContext) {
        appState.audioContext.suspend();
    }
    
    document.getElementById('recordingIndicator').classList.add('hidden');
    document.getElementById('pauseRecordBtn').disabled = true;
    document.getElementById('resumeRecordBtn').disabled = false;
    document.getElementById('resumeRecordBtn').hidden = false;
}

function resumeRecording() {
    appState.isRecording = true;
    appState.isPaused = false;
    
    if (appState.audioContext) {
        appState.audioContext.resume();
    }
    
    document.getElementById('recordingIndicator').classList.remove('hidden');
    document.getElementById('pauseRecordBtn').disabled = false;
    document.getElementById('resumeRecordBtn').hidden = true;
}

function saveTranscript() {
    const text = document.getElementById('transcriptText').value;
    if (!text) {
        alert('Please record something first!');
        return;
    }
    
    appState.transcript = text;
    alert('Transcript saved successfully!');
}

function downloadTranscript() {
    const text = document.getElementById('transcriptText').value;
    if (!text) {
        alert('No transcript to download!');
        return;
    }
    
    downloadFile(text, 'transcript.txt', 'text/plain');
}

// Notes functions
function uploadNotes(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        appState.notes = e.target.result;
        alert(`Notes uploaded: ${file.name}`);
        
        // In real app, would send to backend to save as 'notes.docx'
    };
    reader.readAsText(file);
}

function convertNotesToMarkdown() {
    if (!appState.notes) {
        alert('Please upload notes first!');
        return;
    }

    // Simulate conversion to markdown
    const markdownContent = `# Notes\n\n${appState.notes}\n\n---\n*Converted to Markdown*`;
    document.getElementById('convertedNotesText').value = markdownContent;
    
    alert('Notes converted to Markdown!');
    // In real app, would send to backend and receive 'notes.md'
}

// ChatGPT functions
function finalizeWithChatGPT() {
    const transcriptText = document.getElementById('transcriptText').value;
    const notesText = document.getElementById('convertedNotesText').value;

    if (!transcriptText && !notesText) {
        alert('Please create a transcript or upload notes first!');
        return;
    }

    showStatus('Sending to ChatGPT...', 'pending');
    const responseStartTime = Date.now();

    // Simulate ChatGPT API call
    setTimeout(() => {
        const mockResponse = `# Summary and Analysis

## Key Points
- Comprehensive note-taking strategies discussed
- Importance of organization and structure emphasized
- Regular review process recommended for retention

## Actionable Items
1. Implement structured note-taking method
2. Schedule weekly review sessions
3. Organize notes by topic/category

## Detailed Notes
The discussion highlighted several important aspects of effective note-taking:
- Clear and concise writing improves understanding
- Well-organized notes facilitate quick reference
- Regular review strengthens memory retention

## Recommendations
- Use consistent formatting
- Include page references
- Create a summary section
- Review notes within 24 hours`;

        appState.chatGPTResponse = mockResponse;
        document.getElementById('chatGPTResponse').value = mockResponse;
        
        appState.responseTime = ((Date.now() - responseStartTime) / 1000).toFixed(1);
        document.getElementById('responseTime').textContent = appState.responseTime;
        document.getElementById('responseTimeBox').classList.remove('hidden');
        
        showStatus('ChatGPT processing complete!', 'success');
    }, 2000);
}

function downloadChatGPTResponse() {
    if (!appState.chatGPTResponse) {
        alert('No response to download!');
        return;
    }
    
    downloadFile(appState.chatGPTResponse, 'new_notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

// Feedback functions
function applyFeedback() {
    const feedback = document.getElementById('feedbackText').value;
    
    if (!feedback) {
        alert('Please enter feedback!');
        return;
    }

    if (!appState.chatGPTResponse) {
        alert('Please finalize with ChatGPT first!');
        return;
    }

    showStatus('Applying feedback...', 'pending');
    const feedbackStartTime = Date.now();

    // Simulate ChatGPT API call with feedback
    setTimeout(() => {
        const updatedResponse = appState.chatGPTResponse + `\n\n## Feedback Applied\nUser feedback: "${feedback}"\n\n*Response has been refined based on your feedback.*`;
        appState.chatGPTResponse = updatedResponse;
        document.getElementById('chatGPTResponse').value = updatedResponse;
        
        appState.responseTime = ((Date.now() - feedbackStartTime) / 1000).toFixed(1);
        document.getElementById('responseTime').textContent = appState.responseTime;
        
        showStatus('Feedback applied successfully!', 'success');
    }, 1500);
}

// Utility functions
function showStatus(message, type) {
    const statusBox = document.getElementById('statusBox');
    const statusText = document.getElementById('statusText');
    
    statusBox.classList.remove('hidden', 'pending', 'success', 'error');
    statusBox.classList.add(type);
    statusText.textContent = message;
}

function downloadFile(content, filename, mimeType) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    alert(`Downloaded: ${filename}`);
}

function resetApp() {
    if (confirm('Are you sure you want to start over? All unsaved data will be lost.')) {
        appState.isRecording = false;
        appState.isPaused = false;
        appState.transcript = '';
        appState.notes = '';
        appState.chatGPTResponse = '';
        appState.responseTime = 0;

        // Clean up audio resources
        if (appState.processorNode) {
            appState.processorNode.disconnect();
            appState.processorNode = null;
        }
        if (appState.audioContext) {
            appState.audioContext.close();
            appState.audioContext = null;
        }
        if (appState.ws) {
            appState.ws.close();
            appState.ws = null;
        }

        document.getElementById('transcriptText').value = '';
        document.getElementById('convertedNotesText').value = '';
        document.getElementById('chatGPTResponse').value = '';
        document.getElementById('feedbackText').value = '';
        document.getElementById('notesFileInput').value = '';
        
        document.getElementById('recordingIndicator').classList.add('hidden');
        document.getElementById('startRecordBtn').disabled = false;
        document.getElementById('pauseRecordBtn').disabled = true;
        document.getElementById('resumeRecordBtn').hidden = true;
        
        document.getElementById('statusBox').classList.add('hidden');
        document.getElementById('responseTimeBox').classList.add('hidden');

        alert('Application reset. Ready to start fresh!');
    }
}

// Initialize on page load
window.addEventListener('load', function() {
    console.log('Note Taking Helper loaded successfully!');
});
