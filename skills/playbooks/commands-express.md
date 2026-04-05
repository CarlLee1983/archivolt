# Node.js + Express — Command Table

Maps playbook action keys to file creation commands for a Node.js + Express project.
Assumes TypeScript. Class name variables use PascalCase (e.g., `{{Controller}}`). Path variables use kebab-case (e.g., `{{path}}`).

## create-modules
command: mkdir -p src/modules/{{module}}/{domain,application,infrastructure,presentation}
verify: is_dir(src/modules/{{module}}/domain)

## create-routes
command: |
  # Append to src/routes/{{module}}.routes.ts:
  router.{{method}}('/{{path}}', {{Controller}}.{{action}});
verify: grep -q "{{Controller}}" src/routes/{{module}}.routes.ts

## create-controllers
command: |
  mkdir -p src/controllers
  cat > src/controllers/{{Controller}}.ts << 'TS'
  import { Request, Response } from 'express';
  export class {{Controller}} {
    async index(req: Request, res: Response): Promise<void> {
      res.json([]);
    }
    async show(req: Request, res: Response): Promise<void> {
      res.json({});
    }
    async store(req: Request, res: Response): Promise<void> {
      res.status(201).json({});
    }
    async update(req: Request, res: Response): Promise<void> {
      res.json({});
    }
    async destroy(req: Request, res: Response): Promise<void> {
      res.status(204).send();
    }
  }
  TS
verify: file_exists(src/controllers/{{Controller}}.ts)

## create-models
command: |
  mkdir -p src/models
  cat > src/models/{{Model}}.ts << 'TS'
  export interface {{Model}} {
    id: number;
    createdAt: Date;
    updatedAt: Date;
  }
  TS
verify: file_exists(src/models/{{Model}}.ts)

## create-services
command: |
  mkdir -p src/services
  cat > src/services/{{Service}}.ts << 'TS'
  export class {{Service}} {}
  TS
verify: file_exists(src/services/{{Service}}.ts)

## create-repositories
command: |
  mkdir -p src/repositories
  cat > src/repositories/{{Repository}}.ts << 'TS'
  import { {{Model}} } from '../models/{{Model}}';
  export class {{Repository}} {
    async findAll(): Promise<{{Model}}[]> { return []; }
    async findById(id: number): Promise<{{Model}} | null> { return null; }
    async create(data: Partial<{{Model}}>): Promise<{{Model}}> { return {} as {{Model}}; }
    async update(id: number, data: Partial<{{Model}}>): Promise<{{Model}}> { return {} as {{Model}}; }
    async delete(id: number): Promise<void> {}
  }
  TS
verify: file_exists(src/repositories/{{Repository}}.ts)

## create-entities
command: |
  mkdir -p src/domain/{{module}}
  cat > src/domain/{{module}}/{{Model}}.ts << 'TS'
  export class {{Model}} {
    constructor(public readonly id: number) {}
  }
  TS
verify: file_exists(src/domain/{{module}}/{{Model}}.ts)

## create-events
command: |
  mkdir -p src/events
  cat > src/events/{{Model}}Event.ts << 'TS'
  export interface {{Model}}Event { type: string; payload: unknown; }
  TS
verify: file_exists(src/events/{{Model}}Event.ts)

## create-use-cases
command: |
  mkdir -p src/application/{{module}}
  cat > src/application/{{module}}/{{Model}}UseCase.ts << 'TS'
  export class {{Model}}UseCase {}
  TS
verify: file_exists(src/application/{{module}}/{{Model}}UseCase.ts)

## create-input-ports
command: |
  mkdir -p src/ports/in
  cat > src/ports/in/I{{Model}}UseCase.ts << 'TS'
  export interface I{{Model}}UseCase {}
  TS
verify: file_exists(src/ports/in/I{{Model}}UseCase.ts)

## create-output-ports
command: |
  mkdir -p src/ports/out
  cat > src/ports/out/I{{Repository}}.ts << 'TS'
  export interface I{{Repository}} {}
  TS
verify: file_exists(src/ports/out/I{{Repository}}.ts)

## create-module-contracts
command: |
  mkdir -p src/modules/{{module}}
  cat > src/modules/{{module}}/I{{Module}}Service.ts << 'TS'
  export interface I{{Module}}Service {}
  TS
verify: file_exists(src/modules/{{module}}/I{{Module}}Service.ts)

## create-dci-contexts
command: |
  mkdir -p src/dci
  cat > src/dci/{{Module}}Context.ts << 'TS'
  export class {{Module}}Context {}
  TS
verify: file_exists(src/dci/{{Module}}Context.ts)

## create-repository-interfaces
command: |
  mkdir -p src/domain/{{module}}
  cat > src/domain/{{module}}/I{{Model}}Repository.ts << 'TS'
  export interface I{{Model}}Repository {}
  TS
verify: file_exists(src/domain/{{module}}/I{{Model}}Repository.ts)
