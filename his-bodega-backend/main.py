# main.py
from fastapi import FastAPI, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta, date
from typing import Optional
from decimal import Decimal
from collections import defaultdict
import models
import schemas
import crud
import auth
import database

DEFAULT_ESPECIALIDADES = ['Cirugía','Laboratorio','Urgencias','Medicina Interna','Pediatría','Ginecología','Farmacia','Estéril','General']

app = FastAPI(title="HIS-Bodega", description="Sistema de Gestión de Inventario")

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crear tablas
models.Base.metadata.create_all(bind=database.engine)

def ensure_requisicion_kardex_column():
    """Garantiza que la columna numero_kardex exista aunque la base no esté migrada."""
    try:
        with database.engine.connect() as connection:
            inspector = inspect(connection)
            columns = [col["name"] for col in inspector.get_columns("requisicion_detalles")]
            if "numero_kardex" not in columns:
                connection.execute(
                    text(
                        "ALTER TABLE requisicion_detalles "
                        "ADD COLUMN numero_kardex VARCHAR(100) AFTER unidad"
                    )
                )
                connection.commit()
    except Exception as exc:  # pragma: no cover
        # Evitar que el backend deje de iniciar si no tiene privilegios.
        print("Advertencia: no se pudo asegurar la columna numero_kardex:", exc)

ensure_requisicion_kardex_column()

def sync_insumo_stock(db: Session, insumo: models.Insumo) -> float:
    entradas_total = (
        db.query(func.coalesce(func.sum(models.Entrada.cantidad), 0))
        .filter(models.Entrada.insumo_id == insumo.id)
        .scalar()
        or 0
    )
    salidas_total = (
        db.query(func.coalesce(func.sum(models.Salida.cantidad), 0))
        .filter(models.Salida.insumo_id == insumo.id)
        .scalar()
        or 0
    )
    stock_calculado = float(Decimal(str(entradas_total)) - Decimal(str(salidas_total)))
    stock_actual = float(insumo.stock_actual or 0)
    if abs(stock_actual - stock_calculado) > 1e-6:
        insumo.stock_actual = stock_calculado
        db.add(insumo)
    return stock_calculado

def registrar_auditoria(db, usuario_id, accion, detalle="", ip_address=""):
    auditoria = models.Auditoria(
        usuario_id=usuario_id,
        accion=accion,
        detalle=detalle,
        ip_address=ip_address
    )
    db.add(auditoria)
    db.commit()


def generar_numero_requisicion(db: Session) -> int:
    ultimo = db.query(func.max(models.Requisicion.numero)).scalar()
    return (ultimo or 0) + 1


def generar_numero_kardex(db: Session, insumo_id: int) -> str:
    contador = (
        db.query(func.count(models.RequisicionDetalle.id))
        .filter(models.RequisicionDetalle.insumo_id == insumo_id)
        .scalar()
        or 0
    )
    correlativo = int(contador) + 1
    return f"{insumo_id}-{correlativo:04d}"


def _registrar_salida_para_requisicion(
    db: Session,
    salida: schemas.SalidaCreate,
    current_user: schemas.Usuario,
):
    if salida.usuario_id is None:
        salida.usuario_id = current_user.id
    insumo = db.query(models.Insumo).filter(models.Insumo.id == salida.insumo_id).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    stock_actual_decimal = Decimal(str(insumo.stock_actual or 0))
    cantidad_decimal = Decimal(str(salida.cantidad))
    if stock_actual_decimal < cantidad_decimal:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Stock insuficiente para el insumo {insumo.nombre}. "
                f"Disponible: {float(stock_actual_decimal)}, solicitado: {float(cantidad_decimal)}"
            ),
        )
    insumo.stock_actual = stock_actual_decimal - cantidad_decimal
    crud.create_salida(db=db, salida=salida)

@app.post("/auth/token", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/usuarios/", response_model=schemas.Usuario, status_code=201)
def create_user(user: schemas.UsuarioCreate, db: Session = Depends(database.get_db)):
    db_user = crud.get_usuario_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_usuario(db=db, usuario=user)

@app.get("/usuarios/me", response_model=schemas.Usuario)
def read_users_me(current_user: schemas.Usuario = Depends(auth.get_current_user)):
    return current_user

# CRUD para Insumos (solo admin)
@app.post("/insumos/", response_model=schemas.Insumo, status_code=201)
def create_insumo(insumo: schemas.InsumoCreate, current_user: schemas.Usuario = Depends(auth.get_current_admin_user), db: Session = Depends(database.get_db)):
    db_insumo = crud.create_insumo(db=db, insumo=insumo)
    registrar_auditoria(db, current_user.id, "CREAR INSUMO", f"Nombre: {insumo.nombre}")
    return db_insumo

# ✅ ENDPOINT ACTUALIZADO: Incluye la especialidad
@app.get("/insumos/", response_model=list[schemas.Insumo])
def read_insumos(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    insumos = (
        db.query(models.Insumo)
        .options(joinedload(models.Insumo.especialidad))
        .offset(skip)
        .limit(limit)
        .all()
    )
    updated = False
    for insumo in insumos:
        calculado = sync_insumo_stock(db, insumo)
        if float(insumo.stock_actual or 0) != calculado:
            updated = True
    if updated:
        db.commit()
    return insumos

@app.get("/insumos/{insumo_id}", response_model=schemas.Insumo)
def read_insumo(insumo_id: int, db: Session = Depends(database.get_db)):
    db_insumo = (
        db.query(models.Insumo)
        .options(joinedload(models.Insumo.especialidad))
        .filter(models.Insumo.id == insumo_id)
        .first()
    )
    if db_insumo is None:
        raise HTTPException(status_code=404, detail="Insumo not found")
    calculado = sync_insumo_stock(db, db_insumo)
    if float(db_insumo.stock_actual or 0) != calculado:
        db.commit()
    return db_insumo

@app.put("/insumos/{insumo_id}", response_model=schemas.Insumo)
def update_insumo(insumo_id: int, insumo: schemas.InsumoCreate, current_user: schemas.Usuario = Depends(auth.get_current_admin_user), db: Session = Depends(database.get_db)):
    db_insumo = crud.update_insumo(db, insumo_id=insumo_id, insumo=insumo)
    if db_insumo is None:
        raise HTTPException(status_code=404, detail="Insumo not found")
    registrar_auditoria(db, current_user.id, "ACTUALIZAR INSUMO", f"ID: {insumo_id}, Nombre: {insumo.nombre}")
    return db_insumo

@app.delete("/insumos/{insumo_id}", response_model=schemas.Insumo)
def delete_insumo(insumo_id: int, current_user: schemas.Usuario = Depends(auth.get_current_admin_user), db: Session = Depends(database.get_db)):
    db_insumo = crud.delete_insumo(db, insumo_id=insumo_id)
    if db_insumo is None:
        raise HTTPException(status_code=404, detail="Insumo not found")
    registrar_auditoria(db, current_user.id, "ELIMINAR INSUMO", f"ID: {insumo_id}")
    return db_insumo

# CRUD para Entradas
@app.post("/entradas/", response_model=schemas.Entrada, status_code=201)
def create_entrada(entrada: schemas.EntradaCreate, current_user: schemas.Usuario = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    if entrada.usuario_id is None:
        entrada.usuario_id = current_user.id
    insumo = db.query(models.Insumo).filter(models.Insumo.id == entrada.insumo_id).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado para registrar la entrada.")
    cantidad_decimal = Decimal(str(entrada.cantidad))
    stock_actual_decimal = Decimal(str(insumo.stock_actual or 0))
    insumo.stock_actual = stock_actual_decimal + cantidad_decimal
    try:
        db_entrada = crud.create_entrada(db=db, entrada=entrada)
        db.commit()
        db.refresh(db_entrada)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando la entrada: {str(exc)}")
    registrar_auditoria(db, current_user.id, "REGISTRAR ENTRADA", f"Insumo ID: {entrada.insumo_id}, Cantidad: {entrada.cantidad}")
    return db_entrada

@app.get("/entradas/", response_model=list[schemas.Entrada])
def read_entradas(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    entradas = db.query(models.Entrada).offset(skip).limit(limit).all()
    
    # Añadir nombre del insumo a cada entrada
    for entrada in entradas:
        insumo = db.query(models.Insumo).filter(models.Insumo.id == entrada.insumo_id).first()
        if insumo:
            entrada.insumo_nombre = insumo.nombre
    
    return entradas

@app.post("/salidas/", response_model=schemas.Salida, status_code=201)
def create_salida(salida: schemas.SalidaCreate, current_user: schemas.Usuario = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    if salida.usuario_id is None:
        salida.usuario_id = current_user.id
    
    # Verificar stock disponible
    insumo = db.query(models.Insumo).filter(models.Insumo.id == salida.insumo_id).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    stock_actual_decimal = Decimal(str(insumo.stock_actual or 0))
    cantidad_decimal = Decimal(str(salida.cantidad))
    if stock_actual_decimal < cantidad_decimal:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente. Stock disponible: {float(stock_actual_decimal)}, solicitado: {float(cantidad_decimal)}"
        )
    insumo.stock_actual = stock_actual_decimal - cantidad_decimal
    try:
        db_salida = crud.create_salida(db=db, salida=salida)
        db.commit()
        db.refresh(db_salida)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error registrando la salida: {str(exc)}")
    registrar_auditoria(db, current_user.id, "REGISTRAR SALIDA", f"Insumo ID: {salida.insumo_id}, Cantidad: {salida.cantidad}")
    return db_salida

@app.get("/salidas/", response_model=list[schemas.Salida])
def read_salidas(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return crud.get_salidas(db, skip=skip, limit=limit)

# CRUD para Alertas
@app.post("/alertas/", response_model=schemas.Alerta, status_code=201)
def create_alerta(alerta: schemas.AlertaCreate, current_user: schemas.Usuario = Depends(auth.get_current_admin_user), db: Session = Depends(database.get_db)):
    return crud.create_alerta(db=db, alerta=alerta)

@app.get("/alertas/", response_model=list[schemas.Alerta])
def read_alertas(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """Obtiene todas las alertas activas (elimina las inválidas)"""
    alertas = db.query(models.Alerta).offset(skip).limit(limit).all()
    
    # Filtrar alertas válidas y añadir nombre del insumo
    alertas_validas = []
    for alerta in alertas:
        insumo = db.query(models.Insumo).filter(models.Insumo.id == alerta.insumo_id).first()
        if insumo:
            # Verificar si la alerta aún es válida
            if alerta.mensaje.startswith("Stock bajo"):
                # Alerta de stock bajo: válido si stock_actual < stock_minimo
                if insumo.stock_actual < insumo.stock_minimo and insumo.stock_minimo > 0:
                    alerta.insumo = insumo  # Añadir el objeto insumo completo
                    alerta.insumo_nombre = insumo.nombre
                    alertas_validas.append(alerta)
            elif alerta.mensaje.startswith("Insumo vence pronto"):
                # Alerta de vencimiento: válido si la fecha de vencimiento está en el futuro
                import re
                match = re.search(r'(\d{4}-\d{2}-\d{2})', alerta.mensaje)
                if match:
                    fecha_vencimiento = match.group(1)
                    from datetime import date
                    if date.today() <= date.fromisoformat(fecha_vencimiento):
                        alerta.insumo = insumo  # Añadir el objeto insumo completo
                        alerta.insumo_nombre = insumo.nombre
                        alertas_validas.append(alerta)
    
    return alertas_validas

# ENDPOINT PARA ALERTAS AUTOMÁTICAS (MEJORA #1)
@app.post("/alertas/automáticas", response_model=list[schemas.Alerta])
def generate_automatic_alerts(db: Session = Depends(database.get_db)):
    """Genera alertas automáticas para insumos con stock bajo"""
    insumos_bajo_stock = db.query(models.Insumo).filter(
        models.Insumo.stock_actual < models.Insumo.stock_minimo,
        models.Insumo.stock_minimo > 0
    ).all()
    
    alertas_creadas = []
    for insumo in insumos_bajo_stock:
        # Verificar si ya existe una alerta activa para este insumo
        alerta_existente = db.query(models.Alerta).filter(
            models.Alerta.insumo_id == insumo.id,
            models.Alerta.mensaje.like(f"Stock bajo: {insumo.stock_actual} < {insumo.stock_minimo}")
        ).first()
        
        if not alerta_existente:
            alerta = models.Alerta(
                insumo_id=insumo.id,
                mensaje=f"Stock bajo: {insumo.stock_actual} < {insumo.stock_minimo}",
                fecha=date.today()
            )
            db.add(alerta)
            alertas_creadas.append(alerta)
    
    db.commit()
    return alertas_creadas

# Kardex
@app.get("/kardex/{insumo_id}", response_model=dict)
def get_kardex(insumo_id: int, db: Session = Depends(database.get_db)):
    """Obtiene el kardex de un insumo con cálculos de valor total y consistencia de saldos."""
    insumo = db.query(models.Insumo).filter(models.Insumo.id == insumo_id).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    entradas = (
        db.query(models.Entrada)
        .filter(models.Entrada.insumo_id == insumo_id)
        .order_by(models.Entrada.fecha, models.Entrada.id)
        .all()
    )
    salidas = (
        db.query(models.Salida)
        .filter(models.Salida.insumo_id == insumo_id)
        .order_by(models.Salida.fecha, models.Salida.id)
        .all()
    )

    movimientos = []
    for e in entradas:
        movimientos.append(
            {
                "id": e.id,
                "tipo": "ENTRADA",
                "fecha": e.fecha,
                "cantidad": float(e.cantidad),
                "precio_unitario": float(e.precio_unitario) if e.precio_unitario else 0.0,
                "precio_total": float(e.cantidad * e.precio_unitario) if e.precio_unitario else 0.0,
                "numero_referencia": e.numero_referencia,
                "remitente_destinatario": e.remitente_destinatario,
                "numero_lote": e.numero_lote,
                "fecha_vencimiento": e.fecha_vencimiento,
                "usuario_id": e.usuario_id,
                "created_at": e.created_at,
            }
        )
    for s in salidas:
        movimientos.append(
            {
                "id": s.id,
                "tipo": "SALIDA",
                "fecha": s.fecha,
                "cantidad": float(s.cantidad),
                "precio_unitario": float(s.precio_unitario) if s.precio_unitario else 0.0,
                "precio_total": float(s.cantidad * s.precio_unitario) if s.precio_unitario else 0.0,
                "numero_referencia": s.numero_referencia,
                "remitente_destinatario": s.remitente_destinatario,
                "numero_lote": s.numero_lote,
                "fecha_vencimiento": s.fecha_vencimiento,
                "usuario_id": s.usuario_id,
                "created_at": s.created_at,
            }
        )

    # Ordenar por fecha y, en caso de empate, por el identificador para mantener consistencia cronológica
    movimientos.sort(key=lambda x: (x["fecha"], x.get("id", 0)))

    # Calcular el stock acumulado basado en movimientos
    stock_calculado = 0.0
    ultimo_precio_unitario = 0.0
    for mov in movimientos:
        if mov["tipo"] == "ENTRADA":
            stock_calculado += mov["cantidad"]
        elif mov["tipo"] == "SALIDA":
            stock_calculado -= mov["cantidad"]

        if mov["precio_unitario"] > 0:
            ultimo_precio_unitario = mov["precio_unitario"]

    stock_registrado = float(insumo.stock_actual or 0.0)
    # Si hay diferencia notable, priorizar el stock calculado para mantener consistencia del kardex
    stock_actual = stock_calculado if abs(stock_calculado - stock_registrado) > 0.0001 else stock_registrado
    valor_stock_total = stock_actual * ultimo_precio_unitario
    if abs(stock_registrado - stock_calculado) > 0.0001:
        insumo.stock_actual = stock_calculado
        db.commit()

    insumo_payload = {
        "id": insumo.id,
        "nombre": insumo.nombre,
        "descripcion": insumo.descripcion,
        "unidad_medida": insumo.unidad_medida,
        "stock_actual": stock_actual,
        "stock_registrado": stock_registrado,
        "stock_calculado": stock_calculado,
        "stock_minimo": float(insumo.stock_minimo or 0.0),
        "especialidad_id": insumo.especialidad_id,
    }

    return {
        "insumo": insumo_payload,
        "movimientos": movimientos,
        "stock_actual": stock_actual,
        "stock_calculado": stock_calculado,
        "stock_registrado": stock_registrado,
        "valor_stock_total": valor_stock_total,
        "ultimo_precio_unitario": ultimo_precio_unitario,
    }

# Reporte de stock
@app.get("/reporte-stock", response_model=list)
def get_stock_report(db: Session = Depends(database.get_db)):
    insumos = db.query(models.Insumo).all()
    reporte = []
    for i in insumos:
        alertas = db.query(models.Alerta).filter(models.Alerta.insumo_id == i.id).all()
        reporte.append({
            "insumo_id": i.id,
            "nombre": i.nombre,
            "descripcion": i.descripcion,
            "unidad_medida": i.unidad_medida,
            "stock_actual": float(i.stock_actual),
            "stock_minimo": float(i.stock_minimo),
            "alertas": [a.mensaje for a in alertas]
        })
    return reporte

def _calcular_lotes_disponibles(db: Session, insumo_id: int):
    entradas = (
        db.query(models.Entrada)
        .filter(models.Entrada.insumo_id == insumo_id, models.Entrada.cantidad > 0)
        .order_by(models.Entrada.fecha_vencimiento, models.Entrada.id)
        .all()
    )
    if not entradas:
        return []

    salidas = (
        db.query(models.Salida)
        .filter(models.Salida.insumo_id == insumo_id)
        .order_by(models.Salida.fecha, models.Salida.id)
        .all()
    )

    lotes: dict[str, dict] = {}

    def ensure_lote(key: str, numero_lote: Optional[str], fecha_vencimiento, precio_unitario) -> dict:
        if key not in lotes:
            lotes[key] = {
                "numero_lote": numero_lote,
                "fecha_vencimiento": fecha_vencimiento,
                "precio_unitario": Decimal(str(precio_unitario)) if precio_unitario is not None else Decimal("0"),
                "cantidad_total": Decimal("0"),
                "consumido": Decimal("0"),
            }
        return lotes[key]

    for entrada in entradas:
        key = entrada.numero_lote or f"SIN_LOTE_{entrada.id}"
        lote = ensure_lote(key, entrada.numero_lote, entrada.fecha_vencimiento, entrada.precio_unitario)
        lote["cantidad_total"] += Decimal(str(entrada.cantidad))
        if entrada.fecha_vencimiento and (
            lote["fecha_vencimiento"] is None or entrada.fecha_vencimiento < lote["fecha_vencimiento"]
        ):
            lote["fecha_vencimiento"] = entrada.fecha_vencimiento
        if entrada.precio_unitario and (lote["precio_unitario"] or Decimal("0")) == 0:
            lote["precio_unitario"] = Decimal(str(entrada.precio_unitario))

    salidas_sin_lote: list[Decimal] = []
    for salida in salidas:
        cantidad = Decimal(str(salida.cantidad or 0))
        if cantidad <= 0:
            continue
        if salida.numero_lote:
            key = salida.numero_lote
            lote = ensure_lote(key, salida.numero_lote, salida.fecha_vencimiento, salida.precio_unitario)
            lote["consumido"] += cantidad
        else:
            salidas_sin_lote.append(cantidad)

    lotes_ordenados = sorted(
        lotes.values(),
        key=lambda item: item["fecha_vencimiento"] or date.max
    )

    for cantidad in salidas_sin_lote:
        restante = cantidad
        for lote in lotes_ordenados:
            disponible = lote["cantidad_total"] - lote["consumido"]
            if disponible <= 0:
                continue
            uso = min(disponible, restante)
            lote["consumido"] += uso
            restante -= uso
            if restante <= 0:
                break

    disponibles = []
    for lote in lotes_ordenados:
        disponible = lote["cantidad_total"] - lote["consumido"]
        if disponible > 0:
            disponibles.append(
                {
                    "numero_lote": lote["numero_lote"],
                    "fecha_vencimiento": lote["fecha_vencimiento"],
                    "stock_disponible": float(disponible),
                    "precio_unitario": float(lote["precio_unitario"]),
                }
            )

    return disponibles


@app.get("/insumos/{insumo_id}/lotes-disponibles")
def get_lotes_disponibles(insumo_id: int, db: Session = Depends(database.get_db)):
    """Obtiene los lotes disponibles para un insumo aplicando FEFO y restando las salidas registradas."""
    insumo = db.query(models.Insumo).filter(models.Insumo.id == insumo_id).first()
    if not insumo:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")
    return _calcular_lotes_disponibles(db, insumo_id)


@app.post("/requisiciones", response_model=schemas.Requisicion, status_code=201)
def create_requisicion(
    requisicion: schemas.RequisicionCreate,
    current_user: schemas.Usuario = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    if not requisicion.detalles:
        raise HTTPException(status_code=400, detail="Debes agregar al menos un producto a la requisición.")

    numero = requisicion.numero
    if numero:
        existente = (
            db.query(models.Requisicion)
            .filter(models.Requisicion.numero == numero)
            .first()
        )
        if existente:
            raise HTTPException(status_code=400, detail="El número de requisición ya existe.")
    else:
        numero = generar_numero_requisicion(db)

    numero_despacho = requisicion.numero_despacho or numero
    modelo = models.Requisicion(
        numero=numero,
        numero_despacho=numero_despacho,
        fecha=requisicion.fecha,
        servicio=requisicion.servicio,
        lugar=requisicion.lugar,
        comentario=requisicion.comentario,
        pacientes_hospitalizados=requisicion.pacientes_hospitalizados,
        solicitante_nombre=requisicion.solicitante_nombre,
        solicitante_cargo=requisicion.solicitante_cargo,
        jefe_nombre=requisicion.jefe_nombre,
        jefe_cargo=requisicion.jefe_cargo,
        recibe_nombre=requisicion.recibe_nombre,
        recibe_cargo=requisicion.recibe_cargo,
        entrega_nombre=requisicion.entrega_nombre or current_user.nombre,
        entrega_cargo=requisicion.entrega_cargo,
        created_by=current_user.id,
    )
    db.add(modelo)

    total = Decimal("0")
    lineas_validas = 0

    for detalle_in in requisicion.detalles:
        cantidad_solicitada = Decimal(str(detalle_in.cantidad_solicitada))
        cantidad_despachada = Decimal(str(detalle_in.cantidad_despachada))
        if cantidad_despachada <= 0:
            continue

        insumo = (
            db.query(models.Insumo)
            .filter(models.Insumo.id == detalle_in.insumo_id)
            .first()
        )
        if not insumo:
            raise HTTPException(
                status_code=404,
                detail=f"Insumo con ID {detalle_in.insumo_id} no encontrado.",
            )

        lotes_disponibles = _calcular_lotes_disponibles(db, insumo.id)
        lote_seleccionado = None

        if detalle_in.numero_lote:
            for lote in lotes_disponibles:
                if (lote["numero_lote"] or "") == detalle_in.numero_lote:
                    lote_seleccionado = lote
                    break
            if lote_seleccionado is None:
                raise HTTPException(
                    status_code=400,
                    detail=f"El lote {detalle_in.numero_lote} no está disponible para {insumo.nombre}.",
                )
            if Decimal(str(lote_seleccionado["stock_disponible"])) < cantidad_despachada:
                raise HTTPException(
                    status_code=400,
                    detail=f"La cantidad solicitada supera el stock del lote {detalle_in.numero_lote}.",
                )
        elif lotes_disponibles:
            stock_total = sum(Decimal(str(l["stock_disponible"])) for l in lotes_disponibles)
            if stock_total < cantidad_despachada:
                raise HTTPException(
                    status_code=400,
                    detail=f"No hay stock suficiente para el insumo {insumo.nombre}.",
                )
            for lote in lotes_disponibles:
                if Decimal(str(lote["stock_disponible"])) >= cantidad_despachada:
                    lote_seleccionado = lote
                    break
            if lote_seleccionado is None:
                lote_seleccionado = lotes_disponibles[0]
        else:
            stock_total = Decimal(str(insumo.stock_actual or 0))
            if stock_total < cantidad_despachada:
                raise HTTPException(
                    status_code=400,
                    detail=f"No hay stock suficiente para el insumo {insumo.nombre}.",
                )

        numero_lote = detalle_in.numero_lote or (lote_seleccionado["numero_lote"] if lote_seleccionado else None)
        fecha_vencimiento = detalle_in.fecha_vencimiento or (lote_seleccionado["fecha_vencimiento"] if lote_seleccionado else None)

        if detalle_in.precio_unitario is not None:
            precio_unitario = Decimal(str(detalle_in.precio_unitario))
        elif lote_seleccionado and lote_seleccionado["precio_unitario"] is not None:
            precio_unitario = Decimal(str(lote_seleccionado["precio_unitario"]))
        else:
            precio_unitario = Decimal("0")

        valor_total = cantidad_despachada * precio_unitario
        total += valor_total
        lineas_validas += 1

        detalle_model = models.RequisicionDetalle(
            requisicion=modelo,
            insumo_id=detalle_in.insumo_id,
            codigo=detalle_in.codigo,
            nombre_producto=detalle_in.nombre_producto or insumo.nombre,
            unidad=detalle_in.unidad or insumo.unidad_medida,
            numero_kardex=detalle_in.numero_kardex
            or generar_numero_kardex(db, detalle_in.insumo_id),
            numero_lote=numero_lote,
            fecha_vencimiento=fecha_vencimiento,
            cantidad_solicitada=cantidad_solicitada,
            cantidad_despachada=cantidad_despachada,
            precio_unitario=precio_unitario,
            valor_total=valor_total,
            notas=detalle_in.notas,
        )
        db.add(detalle_model)

        salida_payload = schemas.SalidaCreate(
            insumo_id=detalle_in.insumo_id,
            cantidad=float(cantidad_despachada),
            precio_unitario=float(precio_unitario),
            fecha=requisicion.fecha,
            usuario_id=current_user.id,
            numero_referencia=str(numero),
            remitente_destinatario=requisicion.servicio,
            numero_lote=numero_lote,
            fecha_vencimiento=fecha_vencimiento,
        )
        _registrar_salida_para_requisicion(db, salida_payload, current_user)

    if lineas_validas == 0:
        raise HTTPException(
            status_code=400,
            detail="Debes registrar al menos una línea con cantidad mayor a cero.",
        )

    modelo.total_despachado = total

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear la requisición: {str(exc)}")
    db.refresh(modelo)

    registrar_auditoria(db, current_user.id, "CREAR REQUISICION", f"Número: {modelo.numero}")
    return modelo


@app.get("/requisiciones/proximo-numero")
def get_proximo_numero(db: Session = Depends(database.get_db)):
    numero = generar_numero_requisicion(db)
    return {"numero": numero}


@app.get("/requisiciones", response_model=list[schemas.Requisicion])
def list_requisiciones(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    requisiciones = (
        db.query(models.Requisicion)
        .options(joinedload(models.Requisicion.detalles))
        .order_by(models.Requisicion.fecha.desc(), models.Requisicion.numero.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return requisiciones


@app.get("/requisiciones/{requisicion_id}", response_model=schemas.Requisicion)
def read_requisicion(requisicion_id: int, db: Session = Depends(database.get_db)):
    requisicion = (
        db.query(models.Requisicion)
        .options(joinedload(models.Requisicion.detalles))
        .filter(models.Requisicion.id == requisicion_id)
        .first()
    )
    if not requisicion:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")
    return requisicion


@app.get("/requisiciones/{requisicion_id}/despacho", response_model=schemas.DespachoDocumento)
def read_requisicion_despacho(requisicion_id: int, db: Session = Depends(database.get_db)):
    requisicion = (
        db.query(models.Requisicion)
        .options(joinedload(models.Requisicion.detalles))
        .filter(models.Requisicion.id == requisicion_id)
        .first()
    )
    if not requisicion:
        raise HTTPException(status_code=404, detail="Requisición no encontrada")

    lineas = []
    total = Decimal("0")
    for detalle in requisicion.detalles:
        subtotal = Decimal(str(detalle.valor_total or 0))
        total += subtotal
        lineas.append(
            schemas.DespachoLinea(
                producto=detalle.nombre_producto or (detalle.insumo.nombre if detalle.insumo else ""),
                cantidad=float(detalle.cantidad_despachada or 0),
                precio=float(detalle.precio_unitario or 0),
                subtotal=float(subtotal),
            )
        )

    ingreso_sistema = requisicion.entrega_nombre
    if requisicion.created_by:
        creador = (
            db.query(models.Usuario)
            .filter(models.Usuario.id == requisicion.created_by)
            .first()
        )
        if creador:
            ingreso_sistema = creador.nombre

    return schemas.DespachoDocumento(
        requisicion_id=requisicion.id,
        numero=requisicion.numero_despacho or requisicion.numero,
        servicio=requisicion.servicio,
        fecha=requisicion.fecha,
        comentario=requisicion.comentario,
        total=float(total),
        ingreso_sistema=ingreso_sistema,
        lineas=lineas,
    )


@app.get("/reportes/proximos-a-vencer")
def get_proximos_a_vencer(dias: int = 30, db: Session = Depends(database.get_db)):
    """Lista los lotes con fecha de vencimiento dentro del rango solicitado."""
    if dias <= 0:
        dias = 7
    fecha_hoy = date.today()
    fecha_limite = fecha_hoy + timedelta(days=dias)

    resultados = []
    insumos = db.query(models.Insumo).all()
    for insumo in insumos:
        lotes = _calcular_lotes_disponibles(db, insumo.id)
        for lote in lotes:
            fecha_v = lote["fecha_vencimiento"]
            if not fecha_v:
                continue
            if fecha_hoy <= fecha_v <= fecha_limite:
                resultados.append({
                    "insumo_id": insumo.id,
                    "nombre": insumo.nombre,
                    "numero_lote": lote["numero_lote"],
                    "fecha_vencimiento": fecha_v,
                    "stock_disponible": lote["stock_disponible"],
                    "precio_unitario": lote["precio_unitario"],
                    "dias_restantes": (fecha_v - fecha_hoy).days,
                })

    resultados.sort(key=lambda item: (item["fecha_vencimiento"], -item["stock_disponible"]))
    return {"resultados": resultados, "total": len(resultados), "dias": dias}

@app.post("/alertas/vencimiento", response_model=list[schemas.Alerta])
def generate_vencimiento_alerts(dias: int = 30, db: Session = Depends(database.get_db)):
    """Genera alertas para insumos que vencen en los próximos X días"""
    from datetime import date, timedelta
    
    fecha_limite = date.today() + timedelta(days=dias)
    
    # Obtener entradas con fecha de vencimiento en el rango
    entradas_proximas = db.query(models.Entrada).filter(
        models.Entrada.fecha_vencimiento.isnot(None),
        models.Entrada.fecha_vencimiento >= date.today(),
        models.Entrada.fecha_vencimiento <= fecha_limite
    ).all()
    
    alertas_creadas = []
    for entrada in entradas_proximas:
        # Verificar si ya existe una alerta para este lote
        alerta_existente = db.query(models.Alerta).filter(
            models.Alerta.insumo_id == entrada.insumo_id,
            models.Alerta.mensaje.like(f"Insumo vence pronto: Lote {entrada.numero_lote or 'SIN_LOTE'} - {entrada.fecha_vencimiento}")
        ).first()
        
        if not alerta_existente:
            insumo = db.query(models.Insumo).filter(models.Insumo.id == entrada.insumo_id).first()
            if insumo:
                mensaje = f"Insumo vence pronto: Lote {entrada.numero_lote or 'SIN_LOTE'} - {entrada.fecha_vencimiento}"
                alerta = models.Alerta(
                    insumo_id=entrada.insumo_id,
                    mensaje=mensaje,
                    fecha=date.today()
                )
                db.add(alerta)
                alerta.insumo_nombre = insumo.nombre
                alertas_creadas.append(alerta)
    
    db.commit()
    return alertas_creadas

# Auditoría
@app.get("/auditoria", response_model=dict)
def read_auditoria(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    """Devuelve la bitácora de acciones ordenada de la más reciente a la más antigua."""
    limit = min(max(limit, 1), 1000)
    base_query = db.query(models.Auditoria).order_by(models.Auditoria.fecha.desc(), models.Auditoria.id.desc())
    total = base_query.count()
    registros = base_query.offset(skip).limit(limit).all()

    # Obtener usuarios relacionados para mostrar nombre/rol
    usuario_ids = {registro.usuario_id for registro in registros if registro.usuario_id}
    usuarios = {}
    if usuario_ids:
        rows = db.query(models.Usuario).filter(models.Usuario.id.in_(usuario_ids)).all()
        usuarios = {row.id: {"id": row.id, "nombre": row.nombre, "email": row.email, "rol": row.rol} for row in rows}

    records = []
    for registro in registros:
        records.append({
            "id": registro.id,
            "fecha": registro.fecha,
            "accion": registro.accion,
            "detalle": registro.detalle,
            "ip_address": registro.ip_address,
            "usuario": usuarios.get(registro.usuario_id),
        })

    return {"records": records, "total": total, "skip": skip, "limit": limit}

def ensure_default_especialidades(db: Session):
    existentes = {esp.nombre for esp in db.query(models.Especialidad).all()}
    faltantes = [nombre for nombre in DEFAULT_ESPECIALIDADES if nombre not in existentes]
    if faltantes:
        db.add_all([models.Especialidad(nombre=nombre) for nombre in faltantes])
        db.commit()


# Endpoint para obtener especialidades
@app.get("/especialidades/", response_model=list[schemas.Especialidad])
def read_especialidades(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    ensure_default_especialidades(db)
    return db.query(models.Especialidad).offset(skip).limit(limit).all()

@app.get("/especialidades/disponibles", response_model=list[str])
def read_especialidades_disponibles(db: Session = Depends(database.get_db)):
    """Devuelve los nombres de especialidades disponibles, incluyendo las de insumos sin relación."""
    ensure_default_especialidades(db)
    nombres = {row[0] for row in db.query(models.Especialidad.nombre).all() if row[0]}

    # Detectar insumos sin especialidad asignada
    insumos_sin_especialidad = db.query(models.Insumo).filter(models.Insumo.especialidad_id.is_(None)).count()
    if insumos_sin_especialidad > 0:
        nombres.add("Sin especialidad")

    return sorted(nombres)

# main.py - Añadir este endpoint
@app.get("/reportes/consumo-por-especialidad")
def get_consumo_por_especialidad(
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    fecha_Inicio: Optional[date] = None,
    fecha_Fin: Optional[date] = None,
    especialidad: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    """
    Obtiene el consumo de insumos por especialidad en un rango de fechas.
    Si no se especifican fechas, devuelve el último mes.
    """
    from datetime import date, timedelta

    if fecha_Inicio and not fecha_inicio:
        fecha_inicio = fecha_Inicio
    if fecha_Fin and not fecha_fin:
        fecha_fin = fecha_Fin

    # Establecer rango de fechas por defecto (último mes)
    if fecha_fin is None:
        fecha_fin = date.today()
    if fecha_inicio is None:
        fecha_inicio = fecha_fin - timedelta(days=30)
    especialidad_normalizada = especialidad.strip().lower() if especialidad else None

    # Query principal
    resultados = db.query(
        func.coalesce(models.Especialidad.nombre, "Sin especialidad").label('especialidad'),
        models.Insumo.nombre.label('insumo'),
        func.sum(models.Salida.cantidad).label('cantidad_total'),
        func.sum(models.Salida.cantidad * models.Salida.precio_unitario).label('costo_total')
    ).select_from(models.Salida)\
     .join(models.Insumo, models.Salida.insumo_id == models.Insumo.id)\
     .outerjoin(models.Especialidad, models.Insumo.especialidad_id == models.Especialidad.id)\
     .filter(models.Salida.fecha >= fecha_inicio)\
     .filter(models.Salida.fecha <= fecha_fin)\
     .group_by(func.coalesce(models.Especialidad.nombre, "Sin especialidad"), models.Insumo.nombre)\
     .order_by(func.coalesce(models.Especialidad.nombre, "Sin especialidad"), func.sum(models.Salida.cantidad).desc())

    if especialidad_normalizada and especialidad_normalizada not in {"todas", "todos", "todas las especialidades"}:
        resultados = resultados.having(
            func.lower(func.coalesce(models.Especialidad.nombre, "Sin especialidad")) == especialidad_normalizada
        )

    resultados = resultados.all()

    # Formatear resultado
    reporte = {}
    for row in resultados:
        especialidad = row.especialidad
        if especialidad not in reporte:
            reporte[especialidad] = {
                'total_cantidad': 0,
                'total_costo': 0,
                'insumos': []
            }
        
        cantidad = float(row.cantidad_total) if row.cantidad_total else 0
        costo = float(row.costo_total) if row.costo_total else 0
        
        reporte[especialidad]['insumos'].append({
            'insumo': row.insumo,
            'cantidad': cantidad,
            'costo': costo
        })
        reporte[especialidad]['total_cantidad'] += cantidad
        reporte[especialidad]['total_costo'] += costo
    
    return {
        'periodo': {
            'fecha_inicio': fecha_inicio,
            'fecha_fin': fecha_fin
        },
        'especialidades': reporte
    }






