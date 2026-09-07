# Signing credentials

`zahiri-release.keystore`, `keystore.json`, and `keystore-password.txt` live here
and are **git-ignored**. They are the only way to publish an update to an app
already installed from this APK — if the keystore is lost, existing installs can
never be upgraded, only uninstalled and replaced.

Back this directory up somewhere safe (a password manager or a secrets vault).

The keystore is a 4096-bit RSA key valid until 2054.
