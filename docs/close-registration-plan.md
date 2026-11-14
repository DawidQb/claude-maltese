# Close registration — description and implementation plan

This is a brief for a session that will carry out the change. It is self-contained: read it,
then read the files named under "Where things are", and start.

## Why

The app is a private hobby project whose owner lives in Germany. While anyone can create an
account, the owner collects strangers' email addresses, which brings GDPR duties (a privacy
notice, a processor agreement, account deletion) and arguably a duty to publish an Impressum
with a home address. With accounts limited to the owner and people the owner adds by hand,
the project can count as purely personal use.

The owner has decided to close registration. Do not reopen that question, and do not add a
privacy notice, an Impressum or an account-deletion button: they are a different piece of work.

## Scope

| Step | Who | Change |
|------|-----|--------|
| a | Session | Remove the sign-up form and the `signUp` call from the app. |
| b | Session | README: accounts are created by the owner; how to add a person; the setup steps. |
| c | Owner | Supabase dashboard: switch off new sign-ups. This is what actually closes registration. |
| d | Owner | Supabase dashboard: look through the existing users and remove any that should not stay. |
| e | Both | Check that it worked. |

Steps a and b are code and can be done in either order relative to c and d. Nothing breaks in
between: with sign-ups off and the old app still deployed, "Create account" just shows
Supabase's refusal as an error.

The session has no access to the Supabase dashboard and must not ask for the owner's Supabase
password or a `service_role` key. Steps c and d are instructions to hand to the owner, written
out under "For the owner" below. Finish a and b, then give the owner that section.

Not in scope: the word deck, sync and merge logic, sign-in, password reset, the Export /
Import / Reset buttons, the database migrations. Do not change them.

## Ground rules that must survive

- **Signing in stays optional.** The app works without an account from local storage.
- **Existing accounts keep working**: sign in, sign out, sync, "Forgot password?" and the
  new-password form opened from a reset email all behave as they do now.
- `authMessage` never says whether an address has an account. Keep that.
- With `SUPABASE_KEY` left empty the Account section is still hidden (`accountsEnabled`).
- No new dependency, no new setting, no new screen.

## Where things are

- `src/components/Account.tsx` — the Account section in Settings. `Mode` is
  `'signin' | 'signup' | 'reset'`. The sign-up form is the `if (mode === 'signup')` block; the
  sign-in form has a "Create account" button that switches to it.
- `src/lib/account.ts` — the `useAccount` hook. `signUp` is declared in the `Account`
  interface (with its doc comment), defined with `useCallback`, and returned from the hook.
- `src/components/Settings.tsx` — renders `<Account>` when `account.enabled`, and has the line
  "Sign in above, or export it, to move to another device." It needs no change.
- `README.md` — the last bullet of the feature list, the section "Accounts and sync
  (Supabase)", and its numbered list "Setting up a Supabase project".
- `npm test` runs the unit tests, `npm run build` type-checks and builds. There are no tests
  of `Account.tsx` or `account.ts`; none need adding.

## Step a — the app

`src/components/Account.tsx`:

1. `Mode` becomes `'signin' | 'reset'`.
2. Delete the whole `if (mode === 'signup') { … }` block.
3. In the sign-in form, delete the "Create account" button. "Sign in" is then the only button
   in its row; "Forgot password?" stays in the row below.
4. Change the sign-in form's opening line to:
   "Sign in to keep your progress in step on every device. Sign-in is only for people the
   app's owner has added by hand; there is no sign-up."
   The owner asked for this notice explicitly. It must be visible on the sign-in form itself,
   not only in the README.
5. `repeat`, `mismatch`, `MIN_PASSWORD` and `PasswordField`'s `isNew` are still used by the
   new-password form (`account.recovering`). Keep them. Update the comment above
   `MIN_PASSWORD` if it no longer reads right.

`src/lib/account.ts`:

1. Remove `signUp` from the `Account` interface, its `useCallback` definition, and the
   returned object.
2. Leave `authMessage` alone, including `email_not_confirmed` and `weak_password`: both can
   still come back from sign-in and from setting a new password.

Then search for leftovers: `grep -rn "signUp\|signup\|Create account" src` should print
nothing.

## Step b — the README

- Feature list, last bullet: it says "Sign in (Settings → Account) to keep progress in step on
  every device". Add that accounts are set up by the owner; there is no sign-up in the app.
- "Accounts and sync (Supabase)", first paragraph: replace the sentence "A new account
  confirms its address through a link in an email, and a forgotten password is reset the same
  way." with one that says new accounts are created by the owner in the Supabase dashboard and
  that a forgotten password is reset through a link in an email.
- "Setting up a Supabase project", step 3: it now says to keep "Confirm email" on. Change it
  to: switch off "Allow new users to sign up", and set the minimum password length to at least
  8 (the app asks for 8 when a password is changed).
- Add a short subsection "Adding a person" after the setup list, with the text of "Adding a
  person" below.

Keep the README's plain style: no bold-heavy lists, no emoji.

## For the owner

Hand this section to the owner as it is. The names are those of the Supabase dashboard at the
time of writing; if a switch has moved, look for the same words under Authentication.

**Switch off sign-ups (step c).** Supabase dashboard → the project → Authentication → Sign In
/ Providers → switch off "Allow new users to sign up" → Save. From then on the server refuses
every sign-up, whatever app or script sends it. People who already have an account are not
affected.

**Look through the users (step d).** Authentication → Users. Every row is an account. For any
that should not stay, open the row's menu → Delete user. That also deletes the person's saved
progress (the `progress` row is removed with the user). It cannot be undone, so only delete
accounts you are sure about; progress on that person's own device stays there.

**Adding a person.** Authentication → Users → Add user → Create new user. Enter their email
address and a password, leave "Auto Confirm User" ticked, and create. Give them the password
privately. They sign in under Settings → Account, and can replace the password with their own
through "Forgot password?" on the sign-in form. Add only people you know personally; that is
what keeps the project private.

## Step e — checks

Session, after steps a and b:

1. `npm test` and `npm run build` both pass.
2. `grep -rn "signUp\|signup\|Create account" src` prints nothing.
3. Run the app (`npm run dev`) and open Settings in a browser (Playwright is installed): the
   Account section shows Email, Password, "Sign in" and "Forgot password?", and no "Create
   account". "Forgot password?" still opens the reset form and "Back" returns from it. Look at
   it in a narrow (phone) width, in light and dark.

Owner, after step c, or the session if its network allows the host (a cloud session's network
policy may block it; do not change the policy for this, ask the owner to check instead):

4. Open this address in a browser or with curl. It is a public, read-only endpoint, and the
   key is the publishable one from `src/lib/supabase.ts`:

   ```sh
   curl -s -H "apikey: <SUPABASE_KEY>" "<SUPABASE_URL>/auth/v1/settings"
   ```

   The answer must contain `"disable_signup":true`. Do not test by trying to create an
   account: if the switch is still on, that creates a real one.

5. Sign in with an existing account on the deployed app and see "Up to date".

## Delivery

Commit steps a and b as two commits on the branch the session was given, and push. The change
reaches the live site only when it is merged to `main` (the deploy workflow runs on push to
`main`); open a pull request only if the owner asks for one. In the final message, tell the
owner that registration is not closed until step c is done, and include the "For the owner"
section.
