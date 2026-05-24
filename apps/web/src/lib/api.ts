const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let currentToken: string | null = null;
let currentLogout: (() => void) | null = null;

if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem('token');
    if (stored) currentToken = stored;
  } catch {}
}

export function setAuthRefs(token: string | null, logout: () => void): void {
  currentToken = token;
  currentLogout = logout;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (currentToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (currentLogout) {
      currentLogout();
    }
    throw new Error('Session expired');
  }

  return response;
}
