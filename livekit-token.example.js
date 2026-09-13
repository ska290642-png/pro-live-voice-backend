// Add dependency: npm i livekit-server-sdk
// Then use AccessToken + room grant on the server.
// Never ship LIVEKIT_API_SECRET to Android.
//
// Example outline:
// import { AccessToken } from 'livekit-server-sdk';
// const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET,
//   { identity: userId, ttl: '10m' });
// at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
// const token = await at.toJwt();
// return token;
