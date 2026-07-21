import hashlib
import bcrypt

def hash_password(password):
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

def verify_password(password, stored_hash):
    if stored_hash.startswith("$2"):
        return bcrypt.checkpw(
            password.encode(),
            stored_hash.encode()
        ), None

    legacy_hash = hashlib.sha256(
        password.encode()
    ).hexdigest()

    return legacy_hash == stored_hash, legacy_hash