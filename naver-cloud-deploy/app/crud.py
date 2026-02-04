import uuid
from typing import Any
from datetime import datetime

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import (
    User,
    UserCreate,
    UserUpdate,
    Item,
    ItemCreate,
    ChecklistItem,
    ManualChecklist,
)

# -------------------------------
# 🟢 User 관련 CRUD
# -------------------------------

def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    return session.exec(statement).first()


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user


# -------------------------------
# 🟢 Item 관련 CRUD
# -------------------------------

def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


def get_items_by_owner(*, session: Session, owner_id: uuid.UUID) -> list[Item]:
    statement = select(Item).where(Item.owner_id == owner_id)
    return session.exec(statement).all()


# -------------------------------
# 🟢 Manual Checklist 관련 CRUD
# -------------------------------

def create_manual(
    *, session: Session, title: str, description: str | None = None
) -> ManualChecklist:
    manual = ManualChecklist(title=title, description=description)
    session.add(manual)
    session.commit()
    session.refresh(manual)
    return manual


def get_manual(*, session: Session, manual_id: uuid.UUID) -> ManualChecklist | None:
    return session.get(ManualChecklist, manual_id)


def delete_manual(*, session: Session, manual_id: uuid.UUID) -> bool:
    manual = session.get(ManualChecklist, manual_id)
    if manual:
        session.delete(manual)
        session.commit()
        return True
    return False


def create_checklist_item(
    *,
    session: Session,
    manual_id: uuid.UUID,
    title: str,
    description: str | None = None,
    is_required: bool = True,
) -> ChecklistItem:
    item = ChecklistItem(
        manual_id=manual_id,
        title=title,
        description=description,
        is_required=is_required,
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def get_items_by_manual(*, session: Session, manual_id: uuid.UUID) -> list[ChecklistItem]:
    statement = select(ChecklistItem).where(ChecklistItem.manual_id == manual_id)
    return session.exec(statement).all()


def delete_checklist_item(*, session: Session, item_id: uuid.UUID) -> bool:
    item = session.get(ChecklistItem, item_id)
    if item:
        session.delete(item)
        session.commit()
        return True
    return False
