# Laravel — Command Table

Maps playbook action keys to PHP artisan commands and file creation steps.
Variables use {{PascalCase}} for class names, {{kebab-case}} for paths.

## create-modules
command: |
  mkdir -p app/Modules/{{Module}}/{Domain,Application,Infrastructure,Presentation}
verify: is_dir(app/Modules/{{Module}}/Domain)

## create-routes
command: |
  # Append to routes/api.php:
  Route::{{method}}('/{{path}}', [{{Controller}}::class, '{{action}}']);
verify: grep -q "{{Controller}}" routes/api.php

## create-controllers
command: php artisan make:controller {{Controller}} --api
verify: file_exists(app/Http/Controllers/{{Controller}}.php)

## create-models
command: php artisan make:model {{Model}} -m
verify: file_exists(app/Models/{{Model}}.php)

## create-services
command: php artisan make:class App/Services/{{Service}}
# If make:class is unavailable (no package), use:
# mkdir -p app/Services && touch app/Services/{{Service}}.php
verify: file_exists(app/Services/{{Service}}.php)

## create-repositories
# Laravel has no built-in make:repository.
command: |
  mkdir -p app/Repositories
  cat > app/Repositories/{{Repository}}.php << 'PHP'
  <?php
  namespace App\Repositories;
  use App\Models\{{Model}};
  class {{Repository}} {
      public function all(): \Illuminate\Database\Eloquent\Collection {
          return {{Model}}::all();
      }
      public function find(int $id): ?{{Model}} {
          return {{Model}}::find($id);
      }
      public function create(array $data): {{Model}} {
          return {{Model}}::create($data);
      }
      public function update(int $id, array $data): {{Model}} {
          $record = {{Model}}::findOrFail($id);
          $record->update($data);
          return $record;
      }
      public function delete(int $id): void {
          {{Model}}::destroy($id);
      }
  }
  PHP
verify: file_exists(app/Repositories/{{Repository}}.php)

## create-entities
command: php artisan make:class App/Domain/{{Module}}/{{Model}}
verify: file_exists(app/Domain/{{Module}}/{{Model}}.php)

## create-events
command: php artisan make:event {{Model}}Event
verify: file_exists(app/Events/{{Model}}Event.php)

## create-use-cases
command: php artisan make:class App/Application/{{Module}}/{{Model}}UseCase
verify: file_exists(app/Application/{{Module}}/{{Model}}UseCase.php)

## create-input-ports
command: php artisan make:interface App/Ports/In/I{{Model}}UseCase
# If make:interface unavailable:
# touch app/Ports/In/I{{Model}}UseCase.php
verify: file_exists(app/Ports/In/I{{Model}}UseCase.php)

## create-output-ports
command: php artisan make:interface App/Ports/Out/I{{Repository}}
verify: file_exists(app/Ports/Out/I{{Repository}}.php)

## create-module-contracts
command: php artisan make:interface App/Modules/{{Module}}/I{{Module}}Service
verify: file_exists(app/Modules/{{Module}}/I{{Module}}Service.php)

## create-dci-contexts
command: php artisan make:class App/DCI/{{Module}}Context
verify: file_exists(app/DCI/{{Module}}Context.php)

## create-repository-interfaces
command: php artisan make:interface App/Domain/{{Module}}/I{{Model}}Repository
verify: file_exists(app/Domain/{{Module}}/I{{Model}}Repository.php)
