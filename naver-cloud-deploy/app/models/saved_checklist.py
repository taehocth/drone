import uuid
from datetime import datetime

from sqlmodel import Field, SQLModel


class SavedChecklistBase(SQLModel):
    name: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    checklist_type: str = Field(max_length=50)
    completed_items: str = Field()
    completion_date: datetime = Field(default_factory=datetime.utcnow)
    notes: str | None = Field(default=None, max_length=2000)


class SavedChecklist(SavedChecklistBase, table=True):
    id: uuid.UUID | None = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SavedChecklistCreate(SavedChecklistBase):
    pass


class SavedChecklistPublic(SavedChecklistBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SavedChecklistsPublic(SQLModel):
    data: list[SavedChecklistPublic]
    count: int

