const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export async function generateCode(userPrompt, options, requestId, sessionId) {
    try {
        const body = {
            user_prompt: userPrompt,
            options: options || {
                show_metadata: true,
                show_code: true,
                show_visualization: true,
                show_annotated: true,
                show_complexity: true,
                show_tests: true
            }
        };
        if (requestId) body.request_id = requestId;
        if (sessionId) body.session_id = sessionId;

        const response = await fetch(`${BASE_URL}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        console.log("API Response:", data); // Log API response for debugging
        return data;
    } catch (error) {
        console.error('Error fetching visualization:', error);
        throw error;
    }
}

export async function transcribeAudio(base64Audio, mimeType = 'audio/webm') {
    try {
        const response = await fetch(`${BASE_URL}/api/transcribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ audio: base64Audio, mime_type: mimeType }),
        });

        if (!response.ok) {
            throw new Error(`Transcription API error: ${response.status}`);
        }

        const data = await response.json();
        return data; // { text: "transcribed text" }
    } catch (error) {

        console.error('Error transcribing audio:', error);
        throw error;
    }
}

export async function clearSession(sessionId) {
    try {
        await fetch(`${BASE_URL}/api/session/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId }),
        });
    } catch (error) {
        console.warn('Failed to clear session:', error);
    }
}
