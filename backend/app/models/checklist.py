import uuid
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class ChecklistItemBase(SQLModel):
    title: str
    description: Optional[str] = None
    is_completed: bool = False
    is_required: bool = True
    category: Optional[str] = None


class ChecklistItem(ChecklistItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    manual_id: uuid.UUID = Field(foreign_key="manualchecklist.id")
    manual: "ManualChecklist" | None = Relationship(back_populates="items")


class ManualChecklistBase(SQLModel):
    title: str
    description: Optional[str] = None


class ManualChecklist(ManualChecklistBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    items: List[ChecklistItem] = Relationship(back_populates="manual")
