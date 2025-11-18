import uuid
from typing import Optional, List
from sqlmodel import Field, Relationship, SQLModel
from pydantic import EmailStr

# -----------------------------
# Checklist Models (위로 올림)
# -----------------------------

class ChecklistItemBase(SQLModel):
    title: str
    description: Optional[str] = None
    is_completed: bool = False
    is_required: bool = True
    category: Optional[str] = None


class ChecklistItem(ChecklistItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    manual_id: uuid.UUID = Field(foreign_key="manualchecklist.id")
    manual: Optional["ManualChecklist"] = Relationship(back_populates="items")


class ManualChecklistBase(SQLModel):
    title: str
    description: Optional[str] = None


class ManualChecklist(ManualChecklistBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    items: List[ChecklistItem] = Relationship(back_populates="manual")


# -----------------------------
# User Models
# -----------------------------

class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=40)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=40)
    full_name: str | None = Field(default=None, max_length=255)


class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=40)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=40)
    new_password: str = Field(min_length=8, max_length=40)


class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


class UserPublic(UserBase):
    id: uuid.UUID


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# -----------------------------
# Item Models
# -----------------------------

class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


class ItemCreate(ItemBase):
    pass


class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=255)
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: Optional[User] = Relationship(back_populates="items")


class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# -----------------------------
# Auth & Utility Models
# -----------------------------

class Message(SQLModel):
    message: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=40)


# -----------------------------
# K-index Models
# -----------------------------

class KindexRecent(SQLModel):
    time: str
    kp: float
    kk: float


class Kindex(SQLModel):
    time: str
    currentP: float
    currentK: float
    max24P: float
    max24K: float
    recent: list[KindexRecent]


class KindexResponse(SQLModel):
    error: bool
    errorCode: str
    kindex: Kindex
