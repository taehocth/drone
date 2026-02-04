from sqlmodel import SQLModel


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

