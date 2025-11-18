-- ManualChecklist 테이블 생성
CREATE TABLE manualchecklist (
    id UUID PRIMARY KEY,
    title VARCHAR NOT NULL,
    description VARCHAR
);

-- ChecklistItem 테이블 생성
CREATE TABLE checklistitem (
    id UUID PRIMARY KEY,
    title VARCHAR NOT NULL,
    description VARCHAR,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    category VARCHAR,
    manual_id UUID NOT NULL REFERENCES manualchecklist(id) ON DELETE CASCADE
);