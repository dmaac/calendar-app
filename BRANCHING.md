# Branching Strategy — Fitsi

## Ramas

```
production          ← Solo releases aprobadas. Deploys a App Store / Play Store.
  ↑ merge (tag)
main                ← Código estable. Solo merges desde QA aprobados.
  ↑ merge (PR)
qa                  ← Testing y validación. QA Engineer valida aquí.
  ↑ merge (PR)
develop             ← Integración de features. Ambos devs mergean aquí.
  ↑ merge (PR)
dev/miguel          ← Rama de desarrollo de Miguel
dev/marco           ← Rama de desarrollo de Marco
feature/*           ← Features específicas (opcional, desde develop)
hotfix/*            ← Fixes urgentes (desde main → main + develop)
```

## Flujo de trabajo diario

### 1. Empezar a trabajar
```bash
# Miguel
git checkout dev/miguel
git pull origin develop --rebase

# Marco
git checkout dev/marco
git pull origin develop --rebase
```

### 2. Desarrollar
```bash
# Trabaja en tu rama, haz commits frecuentes
git add <files>
git commit -m "feat: descripción corta"
```

### 3. Integrar a develop
```bash
# Cuando tu feature está lista:
git checkout develop
git pull origin develop
git merge dev/miguel   # o dev/marco
git push origin develop
```

O mejor aún, crear un **Pull Request** en GitHub:
```bash
git push origin dev/miguel
# Crear PR: dev/miguel → develop
```

### 4. QA Testing
```bash
# Cuando develop tiene features listas para testear:
git checkout qa
git pull origin qa
git merge develop
git push origin qa
# QA Engineer corre tests aquí
```

### 5. Release a main
```bash
# Cuando QA aprueba:
git checkout main
git pull origin main
git merge qa
git push origin main
```

### 6. Deploy a production
```bash
# Cuando main está listo para producción:
git checkout production
git pull origin production
git merge main
git tag -a v1.2.0 -m "Release v1.2.0: descripción"
git push origin production --tags
```

## Hotfixes (urgentes)
```bash
git checkout main
git checkout -b hotfix/fix-crash
# ... fix ...
git commit -m "hotfix: fix crash on scan screen"
# Merge a main Y develop:
git checkout main && git merge hotfix/fix-crash
git checkout develop && git merge hotfix/fix-crash
git push origin main develop
git branch -d hotfix/fix-crash
```

## Convención de commits

| Prefijo | Uso |
|---------|-----|
| `feat:` | Nueva funcionalidad |
| `fix:` | Bug fix |
| `refactor:` | Refactoring sin cambio de funcionalidad |
| `test:` | Agregar o modificar tests |
| `docs:` | Documentación |
| `style:` | Formato, linting (sin cambio de lógica) |
| `perf:` | Mejora de performance |
| `ci:` | Cambios en CI/CD |
| `chore:` | Tareas de mantenimiento |
| `hotfix:` | Fix urgente en producción |

## Reglas

1. **NUNCA** hacer push directo a `main`, `qa`, o `production`
2. Todo cambio a `develop` debe ser via PR o merge desde `dev/*`
3. Todo cambio a `qa` debe ser via merge desde `develop`
4. Todo cambio a `main` debe ser via merge desde `qa`
5. Todo cambio a `production` debe ser via merge desde `main` + tag
6. Los agentes de Claude Code deben trabajar en la rama del dev que los invoca
7. Features grandes van en `feature/nombre` (branch desde `develop`)
8. Conflictos se resuelven en la rama de desarrollo, NO en develop/qa/main

## Quién trabaja en qué

| Dev | Rama | Enfoque |
|-----|------|---------|
| Miguel | `dev/miguel` | A definir por sprint |
| Marco | `dev/marco` | A definir por sprint |

## Agentes disponibles

Los 30 agentes en `.claude/agents/` están disponibles para ambos devs.
Cada dev puede invocarlos desde su rama de desarrollo.
