from sqlmodel import SQLModel

# ---------------------
# User models
# ---------------------
from .user import (
    User,
    UserCreate,
    UserUpdate,
    UserUpdateMe,
    UserRegister,
    UserPublic,
    UsersPublic,
    UpdatePassword,
)

# ---------------------
# Item models
# ---------------------
from .item import (
    Item,
    ItemCreate,
    ItemUpdate,
    ItemPublic,
    ItemsPublic,
)

# ---------------------
# Checklist models
# ---------------------
from .checklist import (
    ChecklistItem,
    ManualChecklist,
)

# ---------------------
# Auth / Token models
# ---------------------
from .token import Token, TokenPayload, NewPassword

# ---------------------
# Saved checklist models
# ---------------------
from .saved_checklist import (
    SavedChecklist,
    SavedChecklistBase,
    SavedChecklistCreate,
    SavedChecklistPublic,
    SavedChecklistsPublic,
)

# ---------------------
# K-index models
# ---------------------
from .kindex import Kindex, KindexRecent, KindexResponse

# ---------------------
# Message model
# ---------------------
from .message import Message


__all__ = [
    "SQLModel",

    # User
    "User",
    "UserCreate",
    "UserUpdate",
    "UserUpdateMe",
    "UserRegister",
    "UserPublic",
    "UsersPublic",
    "UpdatePassword",

    # Item
    "Item",
    "ItemCreate",
    "ItemUpdate",
    "ItemPublic",
    "ItemsPublic",

    # Checklist
    "ChecklistItem",
    "ManualChecklist",

    # Token / Auth
    "Token",
    "TokenPayload",
    "NewPassword",

    # Saved checklist
    "SavedChecklistBase",
    "SavedChecklist",
    "SavedChecklistCreate",
    "SavedChecklistPublic",
    "SavedChecklistsPublic",

    # K-index
    "KindexRecent",
    "Kindex",
    "KindexResponse",

    # Message
    "Message",
]
