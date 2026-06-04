import secrets
from sqlalchemy.orm import Session
from app.models.models import Profile

# A curated subset of BIP39 word list for generating user-friendly 12-word recovery phrases
BIP39_WORDLIST_SUBSET = [
    "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract",
    "abuse", "access", "accident", "account", "accuse", "achieve", "acid", "acoustic",
    "acquire", "across", "act", "action", "actor", "actress", "actual", "adapt",
    "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice",
    "aerobic", "affair", "afford", "afraid", "again", "age", "agent", "agree",
    "ahead", "aim", "air", "airport", "alarm", "album", "alcohol", "alert",
    "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already",
    "also", "alter", "always", "amateur", "amazing", "among", "amount", "amused",
    "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal", "ankle",
    "announce", "annual", "another", "answer", "antenna", "antique", "anxiety", "any",
    "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic",
    "area", "arena", "argue", "arm", "armed", "armor", "army", "around",
    "arrange", "arrest", "arrive", "arrow", "art", "artefact", "artist", "artwork",
    "ask", "aspect", "assault", "asset", "assist", "assume", "asthma", "athlete",
    "atom", "attack", "attend", "attitude", "attract", "auction", "audit", "august",
    "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake",
    "award", "away", "awesome", "awful", "awkward", "baby", "back", "bacon",
    "badge", "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner",
    "bar", "barely", "bargain", "barrel", "barrier", "base", "basic", "basket",
    "battle", "beach", "bean", "beauty", "because", "become", "beef", "before",
    "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
    "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike",
    "bind", "biology", "bird", "birth", "bitter", "black", "blade", "blame",
    "blanket", "blast", "bleak", "bless", "blind", "blood", "blossom", "blouse",
    "blue", "blur", "blush", "board", "boat", "body", "boil", "bomb",
    "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss"
]

def generate_recovery_phrase() -> str:
    """
    Generates a cryptographically secure 12-word recovery phrase.
    """
    phrase_words = [secrets.choice(BIP39_WORDLIST_SUBSET) for _ in range(12)]
    return " ".join(phrase_words)

def store_key_backup(db: Session, user_id: str, ciphertext: str) -> bool:
    """
    Stores the user's E2EE private key ciphertext backup in their profile.
    """
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if not profile:
        profile = Profile(user_id=user_id, full_name="User")
        db.add(profile)
    profile.backup_key_ciphertext = ciphertext
    db.commit()
    return True

def retrieve_key_backup(db: Session, user_id: str) -> str:
    """
    Retrieves the user's E2EE private key ciphertext backup.
    """
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    if profile and profile.backup_key_ciphertext:
        return profile.backup_key_ciphertext
    return ""
