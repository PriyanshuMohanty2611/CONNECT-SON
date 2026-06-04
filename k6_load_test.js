import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Initial user baseline ramp
    { duration: '1m', target: 500 },    // Medium scale validation
    { duration: '2m', target: 1000 },   // Peak target load concurrency test
    { duration: '1m', target: 1000 },   // Maintain full soak
    { duration: '30s', target: 0 },     // Ramp down connections cleanly
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of API requests must respond in under 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8000/ws';

export default function () {
  const headers = { 'Content-Type': 'application/json' };
  const userNum = __VU; // virtual user id

  // 1. Simulate authentication (Login attempt, fallback to Registration)
  const loginPayload = JSON.stringify({
    username_or_email: `loadtest_${userNum}`,
    password: 'SecurePassword123'
  });

  let loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, { headers });
  
  if (loginRes.status !== 200) {
    // Register if user doesn't exist yet
    const registerPayload = JSON.stringify({
      username: `loadtest_${userNum}`,
      email: `loadtest_${userNum}@connecton.com`,
      phone: `+180055${String(userNum).padStart(4, '0')}`,
      full_name: `Virtual User ${userNum}`,
      password: 'SecurePassword123',
      confirm_password: 'SecurePassword123'
    });
    http.post(`${BASE_URL}/api/v1/auth/register`, registerPayload, { headers });
    sleep(1);

    // Try logging in again
    loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, loginPayload, { headers });
  }

  const loginSuccess = check(loginRes, {
    'login returns 200 OK': (r) => r.status === 200,
    'jwt token is present': (r) => r.json('access_token') !== undefined
  });

  if (!loginSuccess) {
    sleep(1);
    return;
  }

  const token = loginRes.json('access_token');
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Simulate Resumable Chunked Media Upload manifest registration
  const fileName = `media_payload_${userNum}.bin`;
  const fileChecksum = 'd577273ff885c3f84dadb8578bb4139b65551508ac56c6c547847c20c02553db';
  
  const manifestPayload = JSON.stringify({
    file_name: fileName,
    file_size: 2048,
    checksum: fileChecksum,
    total_chunks: 2
  });

  const uploadStartRes = http.post(`${BASE_URL}/api/v1/upload/start`, manifestPayload, { headers: authHeaders });
  
  const uploadRegistered = check(uploadStartRes, {
    'manifest register status is 200': (r) => r.status === 200,
    'upload_id received': (r) => r.json('upload_id') !== undefined
  });

  if (uploadRegistered) {
    const uploadId = uploadStartRes.json('upload_id');

    // Upload chunk 0
    const chunk0Payload = JSON.stringify({
      upload_id: uploadId,
      chunk_index: 0,
      chunk_data: 'A' * 1024
    });
    http.post(`${BASE_URL}/api/v1/upload/chunk`, chunk0Payload, { headers: authHeaders });
  }

  // 3. Connect to the WebSocket Gateway
  // Engine.io/Socket.io uses transport=websocket
  const socketUrl = `${WS_URL}/?EIO=4&transport=websocket&token=${token}`;

  const wsRes = ws.connect(socketUrl, {}, function (socket) {
    socket.on('open', () => {
      // Socket.IO connection protocol connect packet "40"
      socket.send('40');

      // Send ping every 25 seconds (Engine.io ping)
      socket.setInterval(() => {
        socket.send('2');
      }, 25000);

      // Periodically trigger a dummy event mapping
      socket.setInterval(() => {
        // client-side message sending simulation payload
        socket.send('42["send_message", {"chat_id": "1", "encrypted_content": "test message", "client_msg_id": "d13e3db8-d144-4861-ba0f-ca20f1246c4f"}]');
      }, 5000);
    });

    socket.on('message', (msg) => {
      check(msg, {
        'message payload is not empty': (m) => m && m.length > 0
      });
    });

    // Stay connected for 8 seconds
    socket.setTimeout(() => {
      socket.close();
    }, 8000);
  });

  check(wsRes, {
    'websocket handshake status is 101': (r) => r && r.status === 101
  });

  sleep(1);
}
