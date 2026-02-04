import uuid
from sqlmodel import Field, Relationship, SQLModel
from typing import Optional, List
from .user import User


# ---------------------------------
# Base properties
# ---------------------------------
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# ---------------------------------
# Create
# ---------------------------------
class ItemCreate(ItemBase):
    pass


# ---------------------------------
# Update
# ---------------------------------
class ItemUpdate(SQLModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)


# ---------------------------------
# DB Model
# ---------------------------------
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(
        foreign_key="users.id",  # ← FIXED
        nullable=False,
    )

    owner: Optional[User] = Relationship(back_populates="items")


# ---------------------------------
# API Return Schemas
# ---------------------------------
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID


class ItemsPublic(SQLModel):
    data: List[ItemPublic]
    count: int
