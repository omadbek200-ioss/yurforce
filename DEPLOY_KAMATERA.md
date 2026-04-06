# YurForce Kamatera Deploy

Bu loyiha oddiy Node HTTP server bo'lib, `npm start` orqali ishga tushadi. Frontend va backend bitta serverdan xizmat qiladi, ma'lumotlar esa `backend-data/` papkasida JSON ko'rinishida saqlanadi.

## 1. Kamatera server yaratish

Kamatera panelida:

1. `My Cloud` ichidan `Create New Server` ni oching.
2. Region sifatida foydalanuvchilaringizga yaqin lokatsiyani tanlang.
3. OS sifatida `Ubuntu Server 24.04 LTS` ni tanlang.
4. Minimal tavsiya:
   - `2 vCPU`
   - `2 GB RAM`
   - `20+ GB SSD`
5. Public network yoqilgan bo'lsin.
6. Server password yarating yoki SSH key ulang.
7. `Create Server` ni bosing va public IP ni yozib oling.

## 2. Serverga ulanish

Lokal kompyuteringizdan:

```bash
ssh root@YOUR_SERVER_IP
```

Agar Kamatera sizga boshqa user bergan bo'lsa, o'shani ishlating.

## 3. Bazaviy paketlar

Serverda:

```bash
apt update && apt upgrade -y
apt install -y nginx git curl nodejs npm
node -v
npm -v
```

`node -v` natijasi `18+` bo'lishi kerak. Agar bundan past bo'lsa, Ubuntu image'ni `24.04` bilan qayta tanlash yoki Node LTS'ni alohida o'rnatish kerak.

## 4. Loyihani serverga ko'chirish

Repo'ni serverga yuklang. Eng qulay yo'llar:

### Variant A: Git orqali

```bash
mkdir -p /var/www
cd /var/www
git clone YOUR_REPO_URL yurforce
cd yurforce
npm install --omit=dev
cp .env.example .env
```

### Variant B: Faylni zip qilib upload qilish

Loyihani `/var/www/yurforce` ichiga chiqaring, keyin:

```bash
cd /var/www/yurforce
npm install --omit=dev
cp .env.example .env
```

## 5. Environment sozlash

`.env` faylini oching:

```bash
nano /var/www/yurforce/.env
```

Kamida bularni o'zgartiring:

```env
PORT=3000
ADMIN_EMAIL=admin@yurforce.uz
ADMIN_PASSWORD=JUDA_KUCHLI_YANGI_PAROL
ADMIN_NAME=Platform Admin
```

Eslatma:

- `backend-data/` git ignore qilingan. Serverda birinchi ishga tushganda `server.js` bu papkani va kerakli JSON fayllarni o'zi yaratadi.
- Admin user ham birinchi start paytida `.env` dagi qiymatlar bilan yaratiladi.

## 6. Ilovani test ishga tushirish

```bash
cd /var/www/yurforce
npm start
```

Keyin boshqa terminaldan:

```bash
curl http://127.0.0.1:3000/api/health
```

`ok: true` ga o'xshash JSON qaytishi kerak.

Test tugagach `Ctrl+C`.

## 7. systemd service ulash

Template fayl repo ichida tayyor:

`deploy/yurforce.service.example`

Uni systemd service ga ko'chiring:

```bash
cp /var/www/yurforce/deploy/yurforce.service.example /etc/systemd/system/yurforce.service
systemctl daemon-reload
systemctl enable yurforce
systemctl start yurforce
systemctl status yurforce
```

Log ko'rish:

```bash
journalctl -u yurforce -f
```

## 8. Nginx reverse proxy

Repo ichida template bor:

`deploy/nginx-yurforce.conf`

Domainingizni qo'yib tahrir qiling:

```bash
nano /var/www/yurforce/deploy/nginx-yurforce.conf
```

Bu repo ichidagi template allaqachon `yurforce.uz` va `www.yurforce.uz` uchun moslangan, keyin:

```bash
cp /var/www/yurforce/deploy/nginx-yurforce.conf /etc/nginx/sites-available/yurforce
ln -s /etc/nginx/sites-available/yurforce /etc/nginx/sites-enabled/yurforce
nginx -t
systemctl restart nginx
```

## 9. Domain DNS

Domain registrar panelida:

- `A` record: `@` -> `YOUR_SERVER_IP`
- `A` record: `www` -> `YOUR_SERVER_IP`

DNS tarqalishini kuting.

## 10. HTTPS yoqish

Domain IP ga to'g'ri yo'nalgandan keyin:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yurforce.uz -d www.yurforce.uz
certbot renew --dry-run
```

Kerak bo'lsa domenlarni shu yerda o'zgartirishingiz mumkin.

## 11. Firewall

Ubuntu UFW ishlatsangiz:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

## 12. Update qilish

Keyinroq yangi kod chiqarganingizda:

```bash
cd /var/www/yurforce
git pull
npm install --omit=dev
systemctl restart yurforce
systemctl status yurforce
```

## 13. Tez tekshiruv

Ishga tushganidan keyin tekshiring:

```bash
curl http://127.0.0.1:3000/api/health
curl -I http://yurforce.uz
curl -I https://yurforce.uz
```

## Muammo chiqsa

Ko'p uchraydigan joylar:

1. `node -v` 18 dan past.
2. `.env` ichidagi admin parol yangilanmagan.
3. Domain hali IP ga ulanmagan.
4. `nginx -t` xato beryapti.
5. `systemctl status yurforce` ichida port yoki permission xatosi bor.
