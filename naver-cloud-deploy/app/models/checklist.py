import uuid
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


# -------------------------------
# Base Models
# -------------------------------
class ChecklistItemBase(SQLModel):
    title: str
    description: Optional[str] = None
    is_completed: bool = False
    is_required: bool = True
    category: Optional[str] = None


# -------------------------------
# Checklist Item (child)
# -------------------------------
class ChecklistItem(ChecklistItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    manual_id: uuid.UUID = Field(foreign_key="manualchecklist.id")

    # forward reference는 Optional["Type"]로 작성해야 Python 3.12에서 안전함
    manual: Optional["ManualChecklist"] = Relationship(back_populates="items")


# -------------------------------
# Manual Checklist (parent)
# -------------------------------
class ManualChecklistBase(SQLModel):
    title: str
    description: Optional[str] = None


class ManualChecklist(ManualChecklistBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # children list
    items: List[ChecklistItem] = Relationship(back_populates="manual")
