# Design

## Context

C-19 implementa la pantalla `/hc/:pacienteId` del frontend (pendiente en CHANGES.md) consumiendo el backend clínico ya archivado de C-09 (`hc-odontograma`) y la base frontend de C-13/C-14. La UI debe limitarse a contratos reales del backend y a la guarda de rutas existente, sin modificar backend ni contratos congelados del frontend. Ver `proposal.md` para motivación y alcance, y `specs/frontend-hc-odontograma/spec.md` para los requisitos observables.

**Línea base frontend (previa, verificada por el usuario):** 54 archivos, 468 tests en verde, lint 0/0 con 125 archivos, build de 232 módulos.

**Rama/estado:** `feature/c-19-frontend-hc-odontograma`, `openspec list --json` sin cambios activos al inicio del planning.

### Evidencia literal de backend HC (vigente)

**Endpoints, rutas y status de éxito** (`backend/app/hc/router.py`):
```python
@router.post(
    "/historias-clinicas", response_model=HistoriaClinicaOut, status_code=201
)
def crear_historia(...)

@router.get(
    "/historias-clinicas/{hc_id}", response_model=HistoriaClinicaOut
)
def obtener_historia(...)

@router.get(
    "/pacientes/{paciente_id}/historia-clinica",
    response_model=HistoriaClinicaOut,
)
def obtener_historia_por_paciente(...)

@router.patch(
    "/historias-clinicas/{hc_id}", response_model=HistoriaClinicaOut
)
def actualizar_historia(...)

@router.post(
    "/historias-clinicas/{hc_id}/entradas",
    response_model=EntradaHCOut,
    status_code=201,
)
def agregar_entrada(...)

@router.get(
    "/historias-clinicas/{hc_id}/entradas",
    response_model=list[EntradaHCOut],
)
def listar_entradas(...)

@router.post(
    "/pacientes/{paciente_id}/odontograma",
    response_model=OdontogramaOut,
    status_code=201,
)
def registrar_odontograma(...)

@router.get(
    "/pacientes/{paciente_id}/odontograma",
    response_model=list[OdontogramaOut],
)
def listar_odontograma(...)

@router.get(
    "/pacientes/{paciente_id}/planes-tratamiento",
    response_model=list[PlanTratamientoOut],
)
def listar_planes_por_paciente(...)

@router.get(
    "/planes-tratamiento/{plan_id}", response_model=PlanTratamientoOut
)
def obtener_plan(...)
```

**Schemas y campos (literales)** (`backend/app/hc/schemas.py`):
```python
class HistoriaClinicaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paciente_id: uuid.UUID
    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None

class HistoriaClinicaUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None

class HistoriaClinicaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    antecedentes: str | None = None
    alergias: str | None = None
    observaciones: str | None = None
    creado_en: AwareDatetime

class EntradaHCCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    profesional_id: uuid.UUID
    fecha: AwareDatetime
    texto: str = Field(min_length=1)

class EntradaHCOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    historia_clinica_id: uuid.UUID
    profesional_id: uuid.UUID
    fecha: AwareDatetime
    texto: str
    creado_en: AwareDatetime

class OdontogramaCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pieza: str = Field(pattern=r"^[1-4][1-8]$")
    estado: str
    profesional_id: uuid.UUID
    fecha: AwareDatetime

class OdontogramaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    pieza: str
    estado: str
    profesional_id: uuid.UUID
    fecha: AwareDatetime
    creado_en: AwareDatetime

class PlanTratamientoCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    estado: str = "borrador"

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v not in ESTADOS_PLAN:
            raise ValueError("estado de plan fuera del set provisorio")
        return v

class PlanTratamientoUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    estado: str | None = None

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v is None:
            return v
        if v not in ESTADOS_PLAN:
            raise ValueError("estado de plan fuera del set provisorio")
        return v

class PlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    pieza: str = Field(pattern=r"^[1-4][1-8]$")
    prestacion_id: uuid.UUID
    estado: str = "pendiente"
    monto_centavos: int = Field(ge=0)
    monto_cobertura_centavos: int | None = Field(default=None, ge=0)

    @field_validator("estado")
    @classmethod
    def _estado_valido(cls, v):
        if v not in ESTADOS_ITEM:
            raise ValueError("estado de item fuera del set provisorio")
        return v

class PlanItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    pieza: str
    prestacion_id: uuid.UUID
    estado: str
    monto_centavos: int
    monto_cobertura_centavos: int | None = None

class PlanTratamientoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paciente_id: uuid.UUID
    profesional_id: uuid.UUID
    estado: str
    creado_en: AwareDatetime
    items: list[PlanItemOut] = Field(default_factory=list)
    total_centavos: int = 0
    cobertura_centavos: int = 0
```

**Tipo/catálogo de estado de pieza, códigos FDI válidos y conjuntos de estados de plan/ítem** (`backend/app/hc/models.py`): `Odontograma.estado` es `Text` libre (sin catálogo), pieza con `CheckConstraint("pieza ~ '^[1-4][1-8]$'")`; `ESTADOS_PLAN = ("borrador", "propuesto", "aceptado", "rechazado", "cerrado")`; `ESTADOS_ITEM = ("pendiente", "realizado", "cancelado")`.

**Orden, obtención por paciente y 404 de HC** (`backend/app/hc/service.py`, líneas literales):
```python
def _paciente(session: Session, paciente_id: uuid.UUID) -> Paciente:
    obj = session.query(Paciente).filter_by(id=paciente_id).one_or_none()
    if obj is None:
        raise PacienteNoEncontrado(f"paciente no existe: {paciente_id}")
    return obj

def _historia_por_paciente(
    session: Session, paciente_id: uuid.UUID
) -> HistoriaClinica:
    obj = (
        session.query(HistoriaClinica)
        .filter_by(paciente_id=paciente_id)
        .one_or_none()
    )
    if obj is None:
        raise HistoriaNoEncontrada(
            f"historia clinica no existe para paciente: {paciente_id}"
        )
    return obj

    @staticmethod
    def obtener_por_paciente(
        session: Session, paciente_id: uuid.UUID
    ) -> HistoriaClinica:
        _paciente(session, paciente_id)
        return _historia_por_paciente(session, paciente_id)

    @staticmethod
    def listar_entradas(
        session: Session, hc_id: uuid.UUID
    ) -> list[EntradaHC]:
        _historia(session, hc_id)
        return (
            session.query(EntradaHC)
            .filter_by(historia_clinica_id=hc_id)
            .order_by(EntradaHC.fecha.asc())
            .all()
        )

    @staticmethod
    def listar_odontograma(
        session: Session, paciente_id: uuid.UUID, pieza: str | None = None
    ) -> list[Odontograma]:
        _paciente(session, paciente_id)
        q = session.query(Odontograma).filter_by(paciente_id=paciente_id)
        if pieza is not None:
            q = q.filter_by(pieza=pieza)
        return q.order_by(Odontograma.fecha.asc()).all()
```

**Formas de error** (`backend/app/hc/router.py`):
```python
_NOT_FOUND = (
    PacienteNoEncontrado,
    ProfesionalNoEncontrado,
    PrestacionNoEncontrada,
    HistoriaNoEncontrada,
    PlanNoEncontrado,
)

def _traducir(exc: Exception) -> HTTPException:
    if isinstance(exc, HistoriaDuplicada):
        return HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        )
    if isinstance(exc, PlanNoEditable):
        return HTTPException(
            status_code=409, detail={"causa": exc.causa, "detalle": exc.detalle}
        )
    if isinstance(exc, _NOT_FOUND):
        return HTTPException(status_code=404, detail=exc.detalle)
    if isinstance(exc, (PiezaInvalida, RegistroClinicoInvalido)):
        return HTTPException(status_code=422, detail=exc.detalle)
    raise exc
```

El router solo produce 409 para `HistoriaDuplicada` (POST `/historias-clinicas`) y `PlanNoEditable` (POST `/planes-tratamiento/{id}/items`, fuera de esta UI). `PATCH /historias-clinicas/{id}`, `POST /historias-clinicas/{id}/entradas` y `POST /pacientes/{id}/odontograma` no devuelven 409 por dominio en el servicio actual; devuelven 404 por entidades inexistentes y 422 por validación de dominio o de Pydantic/FastAPI. No hay manejo explícito de 403 en el router HC: si llega por una capa global, la UI lo trata como acceso denegado.

### Evidencia literal de frontend actual

**Ruta y placeholder** (`frontend/src/app/router.tsx`): importa `HistoriaClinicaPage` y declara `{ path: "hc/:pacienteId", element: <HistoriaClinicaPage /> }`.

**Placeholder** (`frontend/src/pages/historia-clinica.tsx`): muestra `h1` "Historia clínica", "Paciente {pacienteId}" y "Pantalla pendiente.".

**Tests de ruteo actuales** (`frontend/src/app/router.test.tsx`): incluye `"/hc/pac-1"` en rutas declaradas con heading "Historia clínica" y un test que navega a `/hc/abc` esperando `Paciente abc`.

**Guardas y rol** (`frontend/src/auth/navigation.ts`): `canNavigate` permite `/agenda` a todos los roles autenticados, `/admin` solo a `admin`, y el resto (incluido `/hc/`) solo a `recepcion`; rol sin permiso redirige a Agenda con aviso "Permiso insuficiente." (`route-guard.test.tsx`).

**Catálogos y datos existentes** (`frontend/src/services/catalogo.ts`, líneas literales relevantes):
```ts
/** Filtros de `GET /pacientes` (`?q=`, inactivos y paginación). */
export interface FiltroPacientes {
    q?: string;
    incluirInactivos?: boolean;
    limit?: number;
    offset?: number;
}

function rutaPacientes(filtro: FiltroPacientes = {}): string {
    const parametros = new URLSearchParams();
    const q = filtro.q?.trim() ?? "";
    if (q.length > 0) {
        parametros.set("q", q);
    }
    parametros.set(
        "limit",
        String(filtro.limit ?? LIMITE_PACIENTES_POR_DEFECTO),
    );
    parametros.set("offset", String(filtro.offset ?? 0));
    if (filtro.incluirInactivos === true) {
        parametros.set("incluir_inactivos", "true");
    }
    return `/pacientes?${parametros.toString()}`;
}

export function useProfesionales(incluirInactivos = false) { /* GET /profesionales */ }
export function usePrestaciones(incluirInactivos = false) { /* GET /prestaciones */ }
```

`resourceKeys` (`frontend/src/services/query.ts`) no tiene raíz de HC. No existe `GET /pacientes/{id}` en backend (`backend/app/agenda/router_catalogo.py`).

**Componentes C-14**: `Modal`, `EmptyState` (`role="status"`), `Skeleton` (`role="status" aria-busy="true"`), `Toast` (`role="status"`), reutilizables sin cambiar contratos.

**Formateo de centavos actual** (`frontend/src/pages/caja.tsx`): `formatCentavos` está definido localmente y usado en la página; `frontend/src/services/caja.ts` expone `parseMontoCajaACentavos` pero no formateador. `frontend/src` contiene `app/`, `auth/`, `components/`, `forms/`, `pages/`, `services/`, `test/`, `types/`, `index.css`, `main.tsx` (no existe carpeta `utils/`).

## Goals / Non-Goals

**Goals:**
- Implementar la UI de `/hc/:pacienteId` alineada a contratos reales de C-09: HC (lectura/creación/edición de cabecera), odontograma (lectura por paciente, alta de observación), planes/presupuesto en solo lectura y entradas clínicas (listado/alta).
- Garantizar accesibilidad y gobernanza ALTO: odontograma de 32 piezas con roving tabindex y `aria-label` completo, estados literales no cromáticos, sin optimistic update, sin reintento automático de mutaciones conflictivas, controles deshabilitados en vuelo y preservación del estado anterior ante 403/404/409/422 según contrato real de cada endpoint.
- Reutilizar infraestructura existente (query/http/errores, componentes C-14, guardas, catálogos `useProfesionales`/`usePrestaciones`) con cambios mínimos y acotados.

**Non-Goals:**
- No crear ni modificar endpoints, modelos, migraciones ni permisos del backend; no inventar reglas clínicas ni catálogos de estados.
- No enviar `prestacion_id` en `POST /pacientes/{paciente_id}/odontograma` (no existe en contrato).
- No crear planes/ítems ni editar estados de plan/ítem.
- No modificar `frontend/src/services/http.ts`, `api-error.ts`, `errors.ts` ni `auth/navigation.ts`.
- No agregar punto de entrada desde la tabla de pacientes de C-15 ni cambiar los cuatro enlaces del nav.
- No calcular cobertura/copago/nomenclador.

## Decisions

### D1. Estados de pieza como texto libre con indicador no cromático
- **Decisión:** `Odontograma.estado` se trata como texto libre (backend `estado: Text/str`, Q-C09-01). La UI renderiza el texto literal con un mapa de estilos por token vacío y extensible que aplica un estilo neutro por defecto. El texto se muestra truncado visualmente en la pieza y completo en el `aria-label` y en el panel de pieza. Cuando no existe observación previa para una pieza, la UI muestra el texto `sin estado registrado` (texto de la UI, no un estado clínico) y la pieza expone `aria-label="Pieza <número>, <cuadrante>, sin estado registrado"`.
- **Rationale:** respeta el contrato vigente y evita hardcodear semántica clínica inexistente; cumple accesibilidad sin depender del color.
- **Alternativas:** mapa predefinido cerrado (descartado: no soportado por backend) o solo color (descartado: inaccesible).

### D2. Permisos delegados al guard existente, sin matriz propia
- **Decisión:** la página no agrega chequeos de rol ni modifica `auth/navigation.ts`. El acceso se rige por `canNavigate` actual (`recepcion` permitido en `/hc/`; `admin` solo `/admin`; `odontologo` y `paciente` solo `/agenda`). Un 403 de backend se muestra como aviso de acceso denegado sin asumir causa específica, manteniendo visible el estado anterior ya cargado y sin reintento automático.
- **Rationale:** evita duplicar lógica de autorización en cliente y respeta que el backend HC no impone permisos/capabilities (Q-C09-05).
- **Desajuste registrado:** KB marca HC como "Posterior" para Recepción y Odontólogo, pero el odontólogo no puede abrir `/hc/` con el guard actual. No se altera `navigation.ts`.

### D3. Planes de tratamiento solo lectura; entradas clínicas incluidas
- **Decisión:** la UI muestra planes devueltos por `GET /pacientes/{paciente_id}/planes-tratamiento` cuyo `PlanTratamientoOut` ya trae los ítems anidados (`items: list[PlanItemOut]`) junto con `total_centavos` y `cobertura_centavos` (evidencia literal arriba); por eso **no se consume `GET /planes-tratamiento/{id}`**. Totales y cobertura del backend formateados a monto, sin crear/editar planes ni ítems. Se incluye listado (`GET /historias-clinicas/{id}/entradas`) y alta (`POST /historias-clinicas/{id}/entradas`) de entradas clínicas.
- **Rationale:** sin entradas la HC editable quedaría reducida a cabecera pese a que el contrato C-09 ya las soporta.
- **Ampliación:** CHANGES.md no nombra explícitamente entradas en C-19; se registra en `proposal.md` (rectificación diferida a rama `docs/...`).

### D4. Cobertura informada y montos en centavos sin recálculo
- **Decisión:** `cobertura_centavos` y `monto_cobertura_centavos` se muestran tal cual; la UI no calcula cobertura, copago ni nomenclador. `total_centavos`/`cobertura_centavos` se formatean a monto y nunca se recalculan en cliente. En cada ítem del plan se muestran, en solo lectura y tal cual, `pieza`, la prestación (resuelta por `usePrestaciones`, con fallback al id), `estado` (texto literal; el backend usa el set provisorio `ESTADOS_ITEM`), `monto_centavos` y, si no es `null`, `monto_cobertura_centavos`; el `estado` del plan también se muestra como texto literal. El origen del total (columna guardada o cálculo del servicio) **no está verificado en estos artefactos**: la UI lo muestra tal cual en cualquier caso y la task 1.2 lo confirma leyendo `models.py` y `service.py` (Open Question 9).

### D5. Estado actual e historial de pieza sin reordenar (consulta única por paciente)
- **Decisión:** para el odontograma se consulta `GET /pacientes/{paciente_id}/odontograma` **una sola vez por paciente, sin filtro `pieza`**, que devuelve observaciones ordenadas por `fecha` ascendente. La UI preserva ese orden para el historial y deriva el estado actual de cada pieza tomando la última observación en el orden recibido para esa pieza (reducción estable por `pieza` que conserva el último elemento visto). El panel de pieza filtra en cliente las observaciones de la pieza seleccionada preservando el orden recibido. No se reordena ni se usa la variante `?pieza=` del endpoint.
- **Rationale:** respeta el orden canónico del backend, evita N requests y mantiene una sola fuente de verdad.
- **Alternativas:** consultar por pieza (descartado: requests innecesarios) u ordenar en cliente (descartado: altera contrato observado).

### D6. Datos del paciente: identificador mostrado sin resolución por id
- **Decisión (ahora, no diferida a implementación):** la pantalla SHALL mostrar el identificador `paciente_id` (UUID de la ruta, ya validado) como dato de contexto visible. No resuelve nombre ni DNI: no existe `GET /pacientes/{id}` y `FiltroPacientes`/`rutaPacientes` de `frontend/src/services/catalogo.ts` usan búsqueda general `q` paginada (`limit`/`offset`), sin búsqueda determinista por UUID. No se agrega lectura propia de catálogo para este fin.
- **Evidencia `frontend/src/services/catalogo.ts` (literal):**
```ts
/** Filtros de `GET /pacientes` (`?q=`, inactivos y paginación). */
export interface FiltroPacientes {
    q?: string;
    incluirInactivos?: boolean;
    limit?: number;
    offset?: number;
}

function rutaPacientes(filtro: FiltroPacientes = {}): string {
    const parametros = new URLSearchParams();
    const q = filtro.q?.trim() ?? "";
    if (q.length > 0) {
        parametros.set("q", q);
    }
    parametros.set(
        "limit",
        String(filtro.limit ?? LIMITE_PACIENTES_POR_DEFECTO),
    );
    parametros.set("offset", String(filtro.offset ?? 0));
    if (filtro.incluirInactivos === true) {
        parametros.set("incluir_inactivos", "true");
    }
    return `/pacientes?${parametros.toString()}`;
}
```
- **Implicación:** los tests de ruteo/binding deben poder verificar la presencia del UUID de la ruta en la pantalla. Open Question 5 permanece abierta (endpoint o estrategia determinista futura). Qué campos busca `q` en `GET /pacientes` del backend **no está verificado en estos artefactos**: la task 1.2 lo lee; si `q` encontrara el UUID de forma determinista, esta decisión se reabre con `/opsx:update` antes de implementar, sin tocar el backend.

### D7. Prestación en odontograma y catálogos existentes
- **Decisión:** el alta de estado de pieza (`OdontogramaCreate`) no incluye `prestacion_id`; la UI no envía prestación. El panel de pieza muestra, en solo lectura, los ítems de planes del paciente cuya `pieza` coincide con la seleccionada, incluyendo `prestacion_id` y nombre de prestación resuelto con `usePrestaciones(true)` para cubrir prestaciones inactivas históricas; si no hay nombre, se muestra el id como fallback. `useProfesionales(true)` se usa para selector de profesional y para mostrar nombre en historial de pieza y entradas (fallback al id). Esto no modifica contratos de odontograma ni crea lecturas propias.
- **Rationale:** cumple el desajuste registrado en `proposal.md` sin inventar contrato y reutiliza catálogos ya existentes.

### D8. Fecha de registros clínicos enviada por UI
- **Decisión:** `fecha` es requerida (`AwareDatetime`) en odontograma y entradas. La UI envía el instante de confirmación con timezone (timestamp actual del cliente en formato ISO/Aware aceptado por backend) y no expone campo editable de fecha. Justificación: el backend ordena historial por `fecha asc` sin tiebreaker secundario y la UI deriva estado actual como último registro en el orden recibido; una fecha retroactiva anterior al último registro no cambiaría necesariamente el estado actual derivado y podría generar ambigüedad. La edición/retroactividad queda fuera de alcance.
- **Open Questions asociadas:** fecha retroactiva y criterio de desempate para fechas iguales.

### D9. Ambigüedad de 404 en `GET /pacientes/{paciente_id}/historia-clinica`
- **Decisión:** se distinguen los dos casos 404 usando el `detail` string del backend (evidencia arriba):
  - **Paciente inexistente:** `_paciente` lanza `PacienteNoEncontrado` con detalle `paciente no existe: {paciente_id}`; el router devuelve 404 con ese detalle. La UI muestra estado de paciente/recurso inexistente y no ofrece crear HC.
  - **Paciente existente sin HC:** `_paciente` pasa y `_historia_por_paciente` lanza `HistoriaNoEncontrada` con detalle `historia clinica no existe para paciente: {paciente_id}`; el router devuelve 404 con ese detalle. La UI muestra estado vacío de HC y permite crearla.
- **Criterio:** la UI identifica "sin HC, permite crear" cuando el detalle de 404 corresponde al patrón de `HistoriaNoEncontrada` por paciente (contiene `historia clinica no existe para paciente`); cualquier otro 404 de ese endpoint (incluido `paciente no existe`) se trata como recurso/paciente inexistente sin flujo de creación. Como refuerzo opcional de implementación, puede confirmarse con consultas ya previstas (`GET /pacientes/{id}/odontograma` devuelve 404 si el paciente no existe y 200 con lista si existe), sin agregar endpoints.
- **Rationale:** evita el escenario contradictorio previo y se apoya en contratos literales observados.
- **Open Question asociada:** si en el futuro el backend cambia los textos de `detail`, el criterio debe ajustarse; hoy el detalle es suficiente.
- **Condiciones no verificadas en estos artefactos:** (1) que `ApiError` (`api-error.ts`/`errors.ts`, congelados) exponga el `detail` del 404 como string legible; (2) que `exc.detalle` sea exactamente el mensaje pasado al `raise` en `service.py`. La task 1.2 las verifica con salida pegada. **Comportamiento seguro:** si el `detail` no llega o no coincide con el patrón de `HistoriaNoEncontrada`, la UI trata el 404 como recurso inexistente y NO ofrece crear la HC (nunca se habilita una creación por un 404 ambiguo). Si (1) o (2) fallan, se detiene el apply y se actualiza este diseño (Open Question 8).

### D10. Errores reales por endpoint y gobernanza de mutaciones
- **Decisión:** los escenarios y la UI se alinean a errores reales:
  - `POST /historias-clinicas`: 201 éxito; 404 paciente/profesional inexistente según validaciones; 409 `historia_clinica_duplicada` (`detail.causa`, `detail.detalle`); 422 validación.
  - `PATCH /historias-clinicas/{id}`: 200 éxito; 404 HC inexistente; 422 validación (`extra` ignorado, tipos). No 409 de dominio en contrato actual.
  - `GET /pacientes/{id}/historia-clinica`: 200 éxito; 404 paciente inexistente o HC inexistente (D9).
  - `POST /historias-clinicas/{id}/entradas`: 201 éxito; 404 HC/profesional inexistente; 422 validación (texto vacío, tipos, fecha).
  - `GET /historias-clinicas/{id}/entradas`: 200 lista; 404 HC inexistente.
  - `POST /pacientes/{id}/odontograma`: 201 éxito; 404 paciente/profesional inexistente; 422 pieza inválida o validación.
  - `GET /pacientes/{id}/odontograma`: 200 lista; 404 paciente inexistente.
  - `GET /pacientes/{id}/planes-tratamiento`: 200 lista; 404 paciente inexistente.
  - 403: no explícito en router HC; si ocurre, se informa como acceso denegado.
- **Formas de 422:** los 422 de dominio (`PiezaInvalida`, `RegistroClinicoInvalido`) llevan `detail` como string; los de validación de Pydantic/FastAPI (por ejemplo `pieza` fuera de `^[1-4][1-8]$` o `texto` vacío) llevan `detail` como lista de errores. La UI muestra el string cuando es string y un mensaje genérico de datos inválidos cuando es una lista, sin volcar la lista cruda; en ambos casos el estado anterior queda intacto. La forma de la lista es comportamiento estándar de FastAPI, no leída del repo: la task 1.2 la confirma.
- **Gobernanza:** mutaciones sin optimistic update, acciones deshabilitadas en vuelo, estado confirmado anterior preservado ante error, y sin reintento automático de mutaciones conflictivas/fallidas (incluido 409). "Sin reintento ante 409" es comportamiento genérico del hook/UI, no afirmación de que todos los endpoints devuelvan 409.
- **Confirmación de alta de estado de pieza:** doble paso con `Modal` de C-14 antes de `POST /pacientes/{id}/odontograma` (alta append-only, dato clínico trazable, estado texto libre). Si el usuario cancela, no se emite ningún request y el estado visible no cambia.

### D11. Accesibilidad del odontograma FDI (patrón ARIA y teclado)
- **Decisión:** el odontograma usa un contenedor con `role="grid"` y 32 piezas como celdas enfocables con **roving tabindex** (`tabIndex=0` solo en la pieza activa, `-1` en el resto), de modo que Tab entra al odontograma en la pieza activa y Tab sale del odontograma en un solo paso. La grilla se estructura en **dos filas**: arcada superior e arcada inferior, con **16 celdas `role="gridcell"` cada una**, en orden anatómico: superior `18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28`; inferior `48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38`. Cada pieza expone `aria-label="Pieza <número>, <cuadrante>, estado <estado literal>"` o, si no hay observación previa, `aria-label="Pieza <número>, <cuadrante>, sin estado registrado"`.
- **Por qué grid/roving tabindex:** permite navegación 2D predecible en una grilla anatómica fija (4 cuadrantes, 8 piezas) con un único punto de tabulación, adecuado para selección de celda sin convertir cada pieza en un control de formulario excluyente; un radiogroup implicaría selección mutuamente excluyente semántica que no coincide con "pieza activa" de consulta.
- **Teclado:**
  - **Flecha izquierda/derecha:** avanza por la fila actual y **cruza la línea media** (p. ej. de 11 pasa a 21 en la arcada superior y de 41 pasa a 31 en la arcada inferior).
  - **Flecha arriba/abajo:** cambia de arcada conservando la columna (misma posición relativa en la fila de 16 celdas).
  - **Home:** selecciona la primera celda de la fila actual.
  - **End:** selecciona la última celda de la fila actual.
  - **Tab / Shift+Tab:** entra o sale del odontograma una sola vez (no recorre las 32 piezas).
  - **Bordes:** no hay envoltura.
- **Pieza activa inicial:** la primera celda de la arcada superior (18).
- **Activación (selección de pieza):** las flechas, Home y End solo mueven el foco; **Enter y Espacio** sobre la pieza enfocada la seleccionan y abren su panel, y el **clic** hace lo mismo. Hay a lo sumo una pieza seleccionada, marcada con `aria-selected="true"` y con un indicador visual no cromático.
- **Foco:** al cerrar el panel el foco vuelve a la celda de la pieza que lo abrió; al cerrar el `Modal` de confirmación (cancelar o confirmar) el foco vuelve al botón que lo abrió y, tras un alta exitosa, a la celda de la pieza. Se reutiliza el manejo de foco y de Escape propio del `Modal` de C-14; la task 1.2 lee su API.
- **Mapeo de cuadrantes (FDI):** 11-18 superior derecha, 21-28 superior izquierda, 31-38 inferior izquierda, 41-48 inferior derecha. El diseño visual debe representar los cuatro cuadrantes de forma consistente con este mapeo; los escenarios de accesibilidad incluyen al menos una pieza fuera del cuadrante superior derecho (ej. pieza 38, inferior izquierda).

### D12. Formateo de montos y extracción de `formatCentavos`
- **Decisión:** para la implementación se decide extraer `formatCentavos` desde `frontend/src/pages/caja.tsx` a `frontend/src/services/money.ts` (carpeta `services/` ya existente; no se crea `frontend/src/utils/`). La extracción es una tarea propia con TDD: test RED del módulo compartido con las mismas salidas que el helper actual, GREEN extrayendo e importando desde `caja.tsx` y HC, y verificación de que `caja.test.tsx` y los usos existentes quedan en verde sin cambio de comportamiento. La función actual **no está pegada en estos artefactos**: la task 1.2 pega `formatCentavos` literal y la salida completa de `git grep -n formatCentavos -- frontend/src`, y la task 5b.2 deriva la tabla de entradas y salidas del RED (cero, negativo, miles, decimales) de ese comportamiento real, sin inventar el formato. Los archivos de C-20 tocados se listan con esa salida (como mínimo `pages/caja.tsx`).
- **Rationale:** evita duplicación y mantiene consistencia; se ubica junto a utilidades/parsers de servicio existentes (`services/caja.ts`).

### D13. Estructura frontend y claves de datos
- **Decisión:** crear `frontend/src/services/hc.ts` y preferir `frontend/src/types/api-hc.ts` para contratos HC/odontograma/planes/entradas. Agregar una sola raíz `resourceKeys.historiasClinicas` (o equivalente) en `frontend/src/services/query.ts` con claves anidadas por paciente/hc/pieza/plan según necesidad. `router.tsx` solo cambia si es estrictamente necesario. No se modifican `http.ts`, `api-error.ts`, `errors.ts`, `auth/navigation.ts`.
- **Archivos nuevos (nombres finales):** `frontend/src/pages/historia-clinica-cabecera.tsx`, `historia-clinica-odontograma.tsx`, `historia-clinica-panel-pieza.tsx`, `historia-clinica-entradas.tsx`, `historia-clinica-planes.tsx` (componentes declarados a nivel de módulo por la regla `react(static-components)`) y `historia-clinica-fdi.ts` (piezas, cuadrantes y labels). `pages/historia-clinica.tsx` solo compone las secciones. Tests nuevos: `services/hc.test.ts`, `services/money.test.ts` y `pages/historia-clinica.test.tsx`. El test de rol a nivel de ruta va en `pages/historia-clinica.test.tsx`, siguiendo el patrón de `auth/route-guard.test.tsx` sin modificar ese archivo.

### D14. Validación de UUID y actualización de tests de ruteo
- **Decisión:** `:pacienteId` se valida como UUID antes de ejecutar consultas; si es inválido, la página renderiza `h1 "Historia clínica"` y aviso, sin requests. `frontend/src/app/router.test.tsx` se actualiza: reemplazar `/hc/pac-1` por un UUID válido en la tabla declarada y ajustar el binding para usar UUID válido; conservar/agregar un caso de id inválido (p.ej. `/hc/abc`) que verifique heading visible, aviso y ausencia de comportamiento dependiente de datos clínicos. Concretamente: (a) el caso de la tabla de rutas declaradas con `/hc/pac-1` (`router.test.tsx:48`) pasa a `/hc/550e8400-e29b-41d4-a716-446655440000` con el mismo heading `Historia clínica`; (b) el test que expone el `pacienteId` con `/hc/abc` (`router.test.tsx:89-90`) se divide en dos: con el UUID válido afirma que el identificador se ve en pantalla, y con `/hc/abc` afirma heading, aviso de identificador inválido y cero requests. Con un UUID válido la página dispara consultas, así que esos tests usan el mismo provider y mock de red que los demás tests de página (lo confirma la task 1.2) y el heading se afirma mientras carga. Ninguna aserción existente se elimina ni se debilita.

## Risks / Trade-offs

- **[Riesgo] Backend HC sin enforcement de permisos (Q-C09-05).** → Mitigación: UI respeta guard cliente, muestra 403 si ocurre, documenta desajuste.
- **[Riesgo] Odontólogo sin acceso a `/hc/` pese a KB.** → Mitigación: no alterar `navigation.ts`; Open Question.
- **[Riesgo] Nombre/DNI de paciente no resolubles sin `GET /pacientes/{id}`.** → Mitigación: mostrar `paciente_id` (D6); Open Question 5.
- **[Riesgo] Estado de pieza libre y largo (Q-C09-01).** → Mitigación: truncado visual + texto completo accesible + mapa de estilos vacío.
- **[Riesgo] Ampliación por entradas clínicas aumenta tamaño.** → Mitigación: dividir grupos 4 y 5 en subgrupos con estimación (ver `tasks.md`).
- **[Riesgo] Extracción de `formatCentavos` afecta C-20.** → Mitigación: tarea TDD propia, sin cambio de comportamiento, identificar archivos consumidores en apply.
- **[Riesgo] Fecha enviada como instante actual impide carga retroactiva.** → Mitigación: decisión explícita D8 y Open Question.

## Migration Plan

- Planning: artefactos OpenSpec actualizados y validados en `openspec/changes/c-19-frontend-hc-odontograma/`.
- Implementación futura (apply): ejecutar tasks TDD por subgrupos, verificar suite/lint/build y ausencia de secretos.
- Rollback: revertir cambios frontend del change; sin migraciones ni cambios de backend.

## Open Questions

1. **Q-C09-01 (estado de pieza):** texto libre sin catálogo; UI usa mapa de estilos vacío/extensible y truncado accesible. ¿Definir catálogo canónico en change posterior? **Impacto:** consistencia clínica/reportes.
2. **Q-C09-05 (permisos HC en backend):** backend sin auth/capabilities de HC. ¿Qué roles pueden leer/editar HC/entradas y cómo se refuerza? **Impacto:** seguridad real.
3. **Odontólogo sin acceso a `/hc/`:** KB marca HC "Posterior" para Recepción y Odontólogo, pero `canNavigate` solo permite `recepcion`. ¿Autorizar odontólogo y en qué alcance? **Impacto:** `navigation.ts`/backend.
4. **Punto de entrada desde C-15:** sin enlace desde tabla de pacientes. ¿Cómo/cuándo agregar acceso? **Impacto:** descubribilidad; ruta usable por URL directa.
5. **Datos del paciente sin `GET /pacientes/{id}`:** se muestra `paciente_id` (D6). ¿Se acepta o se habilita endpoint/estrategia determinista en change separado? **Impacto:** cabecera sin nombre/DNI.
6. **Fecha retroactiva y tiebreaker:** UI envía instante de confirmación no editable y backend ordena por `fecha asc` sin tiebreaker (D8). La fecha sale del reloj del cliente, así que un reloj desajustado altera el orden del historial y el estado actual derivado. ¿Se requiere carga retroactiva o criterio estable ante fechas iguales (`creado_en`/id)? **Impacto:** historial y estado actual derivado.
7. **Prestación asociada al alta de odontograma:** `OdontogramaCreate` no acepta `prestacion_id` (D7, desajuste registrado). La UI muestra ítems de plan de la pieza en solo lectura con prestación resuelta por catálogo. ¿Se requiere cambio de backend futuro para asociar prestación al alta? **Impacto:** no implementable en C-19 sin contrato.
8. **Criterio de 404 en HC por paciente:** se distingue por `detail` literal (D9). ¿Conviene contrato estructurado (`causa`) para evitar dependencia de texto? **Impacto:** robustez ante cambios de mensajes. Depende además de que `ApiError` exponga el `detail` (D9; se verifica en la task 1.2).
9. **Forma de los errores y origen del total (pendiente de verificar en la task 1.2):** los 422 de Pydantic llevan `detail` como lista y los de dominio como string (D10); el origen de `total_centavos` y `cobertura_centavos` (columna o cálculo del servicio) no se leyó. ¿Se contrata una forma de error estructurada? **Impacto:** mensajes mostrados; la UI muestra los valores del backend tal cual en cualquier caso.