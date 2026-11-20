# Oslí můstek

Webová aplikace na učení anglických slovíček přes české zvukové můstky (metoda klíčového slova).
Běží v prohlížeči na mobilu i na PC, jde přidat na plochu a funguje i offline.

- Obecná angličtina A2 → C1 a samostatný balíček **Statika** (stavebnictví a statika).
- Ke každému slovu: obrázek z emoji, výslovnost (britská nebo americká), přepis IPA, český můstek, příběh, který nese význam, příkladová věta a psaní.
- Opakování v rostoucích intervalech (1 den, 3 dny, týden, 3 týdny).
- Postup se ukládá v zařízení a po přihlášení přes Google se synchronizuje přes **Firebase** mezi mobilem a PC.

## 1. Nasazení na GitHub Pages (jednorázově, asi 5 minut)

1. Na https://github.com/new založ veřejný repozitář, např. `osli-mustek`.
2. Nahraj do něj obsah této složky `site` (přes „uploading an existing file“ na webu, nebo přes git).
3. V repozitáři otevři **Settings → Pages**. U „Build and deployment“ zvol *Deploy from a branch*, větev `main`, složka `/ (root)`, a ulož.
4. Za minutu bude aplikace na adrese `https://<tvoje-jméno>.github.io/osli-mustek/`.

Aplikace funguje hned. Bez kroku 2 se postup ukládá jen v zařízení, ve kterém se učíš.

## 2. Synchronizace přes Firebase (jednorázově, asi 10 minut)

1. Na https://console.firebase.google.com klikni na **Add project**, pojmenuj ho (např. `osli-mustek`). Google Analytics můžeš vypnout.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, vyber svůj e-mail a ulož.
3. Ve stejné sekci **Authentication → Settings → Authorized domains → Add domain** přidej `<tvoje-jméno>.github.io`.
4. **Build → Firestore Database → Create database**, lokalita `eur3 (europe-west)`, režim *production*.
5. Na záložce **Rules** nahraď obsah textem ze souboru `firestore.rules` a klikni na **Publish**.
6. **Project settings (ozubené kolo) → General → Your apps → ikona `</>` (Web)**, pojmenuj aplikaci a zaregistruj ji (Hosting nezaškrtávej).
7. Zkopíruj objekt `firebaseConfig` a vlož ho do souboru `firebase-config.js` místo `null`:

   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "….firebaseapp.com",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…"
   };
   ```

8. Změněný `firebase-config.js` nahraj do repozitáře. Po minutě obnov stránku a klikni na **Přihlásit přes Google**.

Údaje v `firebase-config.js` nejsou tajné. Data chrání pravidla Firestore: každý účet čte a zapisuje jen svoje vlastní.
Bezplatný tarif Firebase (Spark) na tohle s velkou rezervou stačí.

## Záloha

V nastavení je **Stáhnout** a **Nahrát** zálohu postupu (soubor JSON). Hodí se i bez Firebase pro ruční přenos mezi zařízeními.

## Úprava slov

Slova jsou v `words/<úroveň>.json`, každé jako pole:
`[anglicky, IPA, čti, česky, můstek, příběh, emoji, příklad, překlad, kategorie]`.
V příběhu je `[můstek]` v hranatých a `{význam}` ve složených závorkách.
