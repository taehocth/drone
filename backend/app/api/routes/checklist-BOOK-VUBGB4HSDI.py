from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from typing import List
import uuid

from app.core.db import get_session  # DB 세션
from app import crud
from app.models import ChecklistItem, ManualChecklist
from app.models import SavedChecklist, SavedChecklistCreate, SavedChecklistPublic, SavedChecklistsPublic

router = APIRouter()

# -------------------------------
# ManualChecklist 관련 API
# -------------------------------

@router.post("/manuals/", response_model=ManualChecklist)
def create_manual(
    title: str,
    description: str | None = None,
    session: Session = Depends(get_session),
):
    return crud.create_manual(session=session, title=title, description=description)


@router.get("/manuals/{manual_id}", response_model=ManualChecklist)
def read_manual(manual_id: uuid.UUID, session: Session = Depends(get_session)):
    manual = crud.get_manual(session=session, manual_id=manual_id)
    if not manual:
        raise HTTPException(status_code=404, detail="Manual not found")
    return manual


@router.delete("/manuals/{manual_id}")
def delete_manual(manual_id: uuid.UUID, session: Session = Depends(get_session)):
    manual = crud.get_manual(session=session, manual_id=manual_id)
    if not manual:
        raise HTTPException(status_code=404, detail="Manual not found")
    session.delete(manual)
    session.commit()
    return {"message": f"Manual {manual_id} deleted successfully"}

# -------------------------------
# ChecklistItem 관련 API
# -------------------------------

@router.post("/manuals/{manual_id}/items/", response_model=ChecklistItem)
def create_checklist_item(
    manual_id: uuid.UUID,
    title: str,
    description: str | None = None,
    is_required: bool = True,
    session: Session = Depends(get_session),
):
    manual = crud.get_manual(session=session, manual_id=manual_id)
    if not manual:
        raise HTTPException(status_code=404, detail="Manual not found")

    return crud.create_checklist_item(
        session=session,
        manual_id=manual_id,
        title=title,
        description=description,
        is_required=is_required,
    )


@router.get("/manuals/{manual_id}/items/", response_model=List[ChecklistItem])
def get_items_by_manual(manual_id: uuid.UUID, session: Session = Depends(get_session)):
    return crud.get_items_by_manual(session=session, manual_id=manual_id)


@router.delete("/items/{item_id}")
def delete_checklist_item(item_id: uuid.UUID, session: Session = Depends(get_session)):
    item = session.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    session.delete(item)
    session.commit()
    return {"message": f"Item {item_id} deleted successfully"}

# -------------------------------
# SavedChecklist 관련 API
# -------------------------------

@router.post("/saved/", response_model=SavedChecklistPublic)
def create_saved_checklist(
    checklist_in: SavedChecklistCreate,
    session: Session = Depends(get_session),
):
    """체크리스트 저장"""
    return crud.create_saved_checklist(session=session, checklist_in=checklist_in)


@router.get("/saved/", response_model=SavedChecklistsPublic)
def read_saved_checklists(
    skip: int = 0,
    limit: int = 100,
    session: Session = Depends(get_session),
):
    """저장된 체크리스트 목록 조회"""
    checklists = crud.get_saved_checklists(session=session, skip=skip, limit=limit)
    count = len(checklists)
    return SavedChecklistsPublic(data=checklists, count=count)


@router.get("/saved/{checklist_id}", response_model=SavedChecklistPublic)
def read_saved_checklist(
    checklist_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """저장된 체크리스트 상세 조회"""
    checklist = crud.get_saved_checklist(session=session, checklist_id=checklist_id)
    if not checklist:
        raise HTTPException(status_code=404, detail="Saved checklist not found")
    return checklist


@router.delete("/saved/{checklist_id}")
def delete_saved_checklist(
    checklist_id: uuid.UUID,
    session: Session = Depends(get_session),
):
    """저장된 체크리스트 삭제"""
    checklist = crud.delete_saved_checklist(session=session, checklist_id=checklist_id)
    if not checklist:
        raise HTTPException(status_code=404, detail="Saved checklist not found")
    return {"message": "Saved checklist deleted successfully"}
