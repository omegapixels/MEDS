#!/bin/sh
# جلب الأصول الثنائية (الخطوط والشعارات) من مستودع GitHub أثناء البناء
BASE=https://raw.githubusercontent.com/omegapixels/MEDS/claude/github-vercel-supabase-setup-o4o096/public
mkdir -p public/fonts
for w in Light Regular Medium Bold Black; do
  [ -f public/fonts/Qomra-$w.woff2 ] || curl -fsSL -o public/fonts/Qomra-$w.woff2 $BASE/fonts/Qomra-$w.woff2
done
for f in logo.png eagle.png icon-192.png icon-512.png; do
  [ -f public/$f ] || curl -fsSL -o public/$f $BASE/$f
done
echo "assets ready:" && ls public/ public/fonts/
