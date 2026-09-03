# Getting Longevity Thread onto a real iPhone

HealthKit returns no data in the simulator and background delivery is a
no-op there, so the sync cannot be proven without a device build. The
`development` profile in `eas.json` sets `"simulator": false` for exactly
that reason.

Everything below needs an Apple ID and physical access to the phone, so
it has to be run by you.

## One time

1. An Apple Developer Program membership (~$99/year), if you do not have
   one: https://developer.apple.com/programs/

2. Install the CLI and sign in to Expo:

   ```
   npm install -g eas-cli
   eas login
   ```

3. From the project directory, link it to an EAS project. This writes
   `extra.eas.projectId` into `app.json`, which is why that field is not
   committed — it does not exist until an Expo account creates it:

   ```
   eas init
   ```

4. Register the iPhone you will install onto. This walks you through
   creating a provisioning profile:

   ```
   eas device:create
   ```

## Each build

```
eas build --profile development --platform ios
```

EAS will offer to generate the signing credentials for you; say yes
unless you already manage certificates by hand. When the build finishes
it prints a QR code — scan it on the iPhone to install.

## Running it

```
npx expo start --dev-client
```

Open the installed app on the phone and it connects to that server.

## What to expect the first time

1. Sign in as a test patient. The account must exist in `auth.users` and
   have a row in `patients` with a matching `user_id`, or ingest returns
   403 — the function resolves the patient from the token and refuses to
   guess.
2. iOS shows the Health permission sheet. Grant the five metrics.
3. The list fills in as the first sync completes.

An empty list after granting access is not necessarily a bug. HealthKit
does not disclose read denials — a declined metric returns no samples,
which looks identical to having no data. Check a metric you know has data
in the Health app.

## Environment

`eas.json` sets `EXPO_PUBLIC_SUPABASE_URL` for the development profile.
The anon key is deliberately not in this file. Set it as an EAS secret so
it is not committed:

```
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <the anon key>
```

The anon key is safe to ship in a client build — RLS is what protects the
data, and `observations` has no INSERT policy at all — but keeping it out
of the repo avoids it being copied somewhere it does not belong.
