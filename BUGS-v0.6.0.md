# Bugs Encontrados en smart-agent-workflow-mcp v0.6.0

> Fecha del testing: 2026-01-02
> Proyecto de prueba: sustainability-web (Vite + React, sin Playwright)

## Resumen Ejecutivo

| Severidad | Bug | Estado |
|-----------|-----|--------|
| CRITICA | State machine no permite planning -> testing | ✅ Corregido v0.6.1 |
| CRITICA | rollbackFeature no valida worktree_path requerido | ✅ Corregido v0.6.1 |
| CRITICA | loadMemoryStore no valida campos | ✅ Corregido v0.6.1 |
| MEDIA | MCP permite iniciar multiples workflows simultaneos | ✅ Corregido v0.6.1 |
| BAJA | getWorkflowStatus retorna false para workflow activo | Por investigar |

---

## BUG 1: State Machine Transition Error (CRITICO)

### Descripcion
`complete_feature` falla con error:
```
Invalid phase transition: planning -> testing. Valid transitions: implementing, failed
```

### Reproduccion
1. Llamar `start_feature` (crea workflow en fase `planning`)
2. Llamar `complete_feature` inmediatamente
3. Error: la transicion `planning -> testing` no es valida

### Causa Raiz
En `src/tools/workflow/complete-feature.ts:81`:
```typescript
workflow = await transitionPhase(workflow.id, 'testing');
```

Pero el state machine define en `src/tools/workflow/state-machine.ts:27`:
```typescript
planning: ['implementing', 'failed'],  // Solo puede ir a implementing o failed
```

El workflow se crea en `planning`, pero `complete_feature` asume que ya esta en `implementing`.

### Solucion Propuesta
Opcion A: `complete_feature` debe verificar la fase actual y transicionar por las fases intermedias necesarias:
```typescript
if (workflow.current_phase === 'planning') {
  workflow = await transitionPhase(workflow.id, 'implementing');
}
if (workflow.current_phase === 'implementing') {
  workflow = await transitionPhase(workflow.id, 'testing');
}
```

Opcion B: Documentar que el usuario debe transicionar manualmente a `implementing` antes de `complete_feature`.

---

## BUG 2: rollbackFeature No Valida Input Requerido (CRITICO)

### Descripcion
`rollback_feature` falla con:
```
Rollback failed: Command failed: git worktree remove "undefined" --force
fatal: 'undefined' no es un árbol de trabajo
```

### Reproduccion
1. Llamar `start_feature` para crear un worktree
2. Llamar `rollbackFeature({ reason: 'test' })` SIN worktree_path
3. Error: pasa `undefined` a git

### Causa Raiz
En `src/tools/workflow/rollback-feature.ts:43`:
```typescript
required: ['worktree_path', 'reason'],
```

El schema marca `worktree_path` como requerido, pero NO hay validacion en la funcion antes de usarlo:
```typescript
const { worktree_path, reason, keep_branch = false } = args;
// ...
await abortWorktree(worktree_path, reason);  // worktree_path puede ser undefined
```

### Solucion Propuesta
Agregar validacion al inicio de la funcion:
```typescript
if (!worktree_path) {
  return {
    success: false,
    error: 'worktree_path is required',
    ...
  };
}
```

O mejor aun: usar el current workflow si no se proporciona worktree_path:
```typescript
const targetPath = worktree_path || (await getCurrentWorkflow())?.worktree_path;
if (!targetPath) {
  return { success: false, error: 'No worktree path provided and no active workflow found' };
}
```

---

## BUG 3: Multiple Workflows Permitidos (MEDIA)

### Descripcion
El MCP permite iniciar multiples features simultaneamente sin advertencia.

### Reproduccion
1. Llamar `start_feature({ feature_name: 'first' })`
2. Llamar `start_feature({ feature_name: 'second' })`
3. Ambos tienen exito, creando 2 worktrees y sobrescribiendo `current-workflow.json`

### Causa Raiz
`start_feature` en `src/tools/workflow/start-feature.ts` no verifica si ya existe un workflow activo:
```typescript
export async function startFeature(args: StartFeatureArgs): Promise<WorkflowResult> {
  // NO hay verificacion de getCurrentWorkflow() aqui
  const worktreeInfo = await createWorktree(feature_name, base_branch);
  const workflow = await createWorkflow(...);
  return { success: true, ... };
}
```

### Solucion Propuesta
Agregar verificacion al inicio:
```typescript
const existingWorkflow = await getCurrentWorkflow();
if (existingWorkflow && existingWorkflow.current_phase !== 'completed' && existingWorkflow.current_phase !== 'rolled_back') {
  return {
    success: false,
    error: `Another workflow is already active: ${existingWorkflow.feature_name} (${existingWorkflow.current_phase})`,
    message: 'Complete or rollback the current workflow before starting a new one.',
  };
}
```

---

## BUG 4: getWorkflowStatus Retorna Inactivo (BAJA)

### Descripcion
`get_workflow_status` retorna `{ active: false }` cuando hay un workflow activo.

### Evidencia del Test
```
Test 2.3: Verificando workflow status...
⚠️  No active workflow found (unexpected)
```

### Posible Causa
El archivo `current-workflow.json` se guarda en `.smart-agent-workflow/` (linea 18 de state-machine.ts), pero `getWorkflowStatus` podria estar buscando en otro lugar, o el cwd no coincide.

### Por Investigar
- Verificar que el cwd sea consistente entre `start_feature` y `get_workflow_status`
- Verificar que el archivo se cree correctamente

---

## Observaciones Adicionales

### Edge Cases que Funcionan Correctamente

| Test | Resultado |
|------|-----------|
| Feature name con acentos (áéíóú) | PASS |
| Feature name muy largo | PASS |
| Complete con path invalido | PASS (rechazado correctamente) |
| Health tracking | PASS (formula correcta) |
| Manual checkpoint | PASS (restaura a 100%) |
| Memory persistence | PASS (7 entries guardadas) |

### Funcionalidades Verificadas OK

- Context Health formula: `100 - (ops*0.5 + tokens*0.001 + time*0.5)`
- Health despues de 12 ops: 93% (correcto)
- Checkpoint restaura health a 100% (correcto)
- Memory se persiste en `.smart-agent/memory.json` (correcto)
- Worktrees se crean en `/home/vicente/RoadToDevOps/worktrees/` (correcto)

---

## BUG 5: loadMemoryStore No Valida Campos (CRITICO)

### Descripcion
`memory://knowledge` resource y `getMemoryStats` crashean con:
```
TypeError: Cannot read properties of undefined (reading 'map')
    at getMemoryStats (store.js:225)
        contexts_list: store.contexts.map((c) => ...)
```

### Reproduccion
1. Crear `.smart-agent/memory.json` manualmente con solo `entries` (sin `contexts`)
2. Llamar `memory://knowledge` o `getMemoryStats`
3. Crash porque `store.contexts` es `undefined`

### Causa Raiz
En `src/tools/memory/store.ts:52-64`, `loadMemoryStore` lee el archivo y hace `return store` sin validar que tenga todos los campos requeridos:

```typescript
export async function loadMemoryStore(cwd?: string): Promise<MemoryStore> {
  try {
    const content = await fs.readFile(memoryPath, 'utf-8');
    const store: MemoryStore = JSON.parse(content);
    return store;  // <-- No validation!
  } catch {
    return createEmptyStore();
  }
}
```

Si el archivo existe pero no tiene `contexts`, `store.contexts` sera `undefined`.

### Solucion Propuesta
Agregar validacion/migracion despues de cargar:
```typescript
export async function loadMemoryStore(cwd?: string): Promise<MemoryStore> {
  try {
    const content = await fs.readFile(memoryPath, 'utf-8');
    const store: MemoryStore = JSON.parse(content);

    // Ensure all required fields exist (migration/validation)
    if (!store.entries) store.entries = [];
    if (!store.contexts) store.contexts = [];
    if (!store.stats) store.stats = { total_entries: 0, total_contexts: 0, by_type: {} };

    return store;
  } catch {
    return createEmptyStore();
  }
}
```

---

## Prioridad de Correccion

1. **INMEDIATA**: BUG 1 (state machine) - Bloquea el flujo principal
2. **INMEDIATA**: BUG 2 (validacion input) - Causa crash con input invalido
3. **INMEDIATA**: BUG 5 (memory validation) - Causa crash en resources
4. **PRONTO**: BUG 3 (multiple workflows) - Puede causar confusion/corrupcion
5. **EVENTUAL**: BUG 4 (status) - Afecta solo monitoreo
