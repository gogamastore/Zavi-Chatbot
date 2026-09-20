// ---------------------------------------------------------------------------
// Kelola akun owner Zavi (custom claim `owner: true`).
//
// Dijalankan dari terminal Anda, bukan dari aplikasi. Itu memang inti
// pengamanannya: custom claim hanya bisa diberikan lewat Admin SDK dengan
// service account, sehingga tidak ada pengguna yang bisa mengangkat dirinya
// sendiri jadi owner lewat web.
//
//   node --env-file=.env.local scripts/owner.mjs daftar
//   node --env-file=.env.local scripts/owner.mjs beri  <email>
//   node --env-file=.env.local scripts/owner.mjs cabut <email>
//   node --env-file=.env.local scripts/owner.mjs buat  <email>      # sandi dari stdin
//
// Sandi dibaca dari stdin, TIDAK dari argumen — argumen tersimpan di riwayat
// shell dan terlihat di daftar proses.
// ---------------------------------------------------------------------------
import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const CLAIM = "owner";

function app() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return initializeApp({ credential: applicationDefault() });
}

const auth = getAuth(app());

async function bacaStdin() {
  const potongan = [];
  for await (const c of process.stdin) potongan.push(c);
  return Buffer.concat(potongan).toString("utf8").replace(/\r?\n$/, "");
}

async function cariUser(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return null;
  }
}

async function beri(email) {
  const u = await cariUser(email);
  if (!u) {
    console.error(`Akun ${email} belum ada. Jalankan perintah "buat" lebih dulu.`);
    process.exit(1);
  }
  await auth.setCustomUserClaims(u.uid, { ...(u.customClaims ?? {}), [CLAIM]: true });
  // Cabut sesi lama supaya token tanpa claim tidak dipakai lagi, dan token
  // berikutnya pasti membawa claim yang baru.
  await auth.revokeRefreshTokens(u.uid);
  console.log(`OK — ${email} (${u.uid}) sekarang owner. Sesi lama dicabut, silakan login ulang.`);
}

async function cabut(email) {
  const u = await cariUser(email);
  if (!u) {
    console.error(`Akun ${email} tidak ditemukan.`);
    process.exit(1);
  }
  const sisa = { ...(u.customClaims ?? {}) };
  delete sisa[CLAIM];
  await auth.setCustomUserClaims(u.uid, sisa);
  await auth.revokeRefreshTokens(u.uid);
  console.log(`OK — akses owner ${email} dicabut, semua sesinya diputus.`);
}

async function daftar() {
  let hasil = await auth.listUsers(1000);
  const owner = [];
  for (;;) {
    for (const u of hasil.users) {
      if (u.customClaims?.[CLAIM] === true) owner.push(u);
    }
    if (!hasil.pageToken) break;
    hasil = await auth.listUsers(1000, hasil.pageToken);
  }
  if (!owner.length) {
    console.log("Belum ada akun owner.");
    return;
  }
  console.log(`Owner terdaftar (${owner.length}):`);
  for (const u of owner) {
    const login = u.metadata.lastSignInTime ?? "belum pernah";
    console.log(`  ${u.email}  uid=${u.uid}  login terakhir: ${login}`);
  }
}

async function buat(email) {
  const sandi = await bacaStdin();
  if (sandi.length < 8) {
    console.error("Kata sandi minimal 8 karakter (dibaca dari stdin).");
    process.exit(1);
  }
  let u = await cariUser(email);
  if (u) {
    await auth.updateUser(u.uid, { password: sandi });
    console.log(`Akun ${email} sudah ada — kata sandinya diperbarui.`);
  } else {
    u = await auth.createUser({ email, password: sandi, emailVerified: true });
    console.log(`Akun ${email} dibuat (uid=${u.uid}).`);
  }
  await beri(email);
}

const [perintah, email] = process.argv.slice(2);
const butuhEmail = ["beri", "cabut", "buat"];
if (butuhEmail.includes(perintah) && !email) {
  console.error(`Perintah "${perintah}" butuh email.`);
  process.exit(1);
}

switch (perintah) {
  case "daftar":
    await daftar();
    break;
  case "beri":
    await beri(email);
    break;
  case "cabut":
    await cabut(email);
    break;
  case "buat":
    await buat(email);
    break;
  default:
    console.error("Perintah: daftar | beri <email> | cabut <email> | buat <email>");
    process.exit(1);
}
process.exit(0);
