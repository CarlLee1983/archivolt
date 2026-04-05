# Python + Django — Command Table

Maps playbook action keys to Django management commands and file creation steps.
Assumes Django REST Framework. Class name variables use PascalCase (e.g., `{{Controller}}`). Path variables use snake_case (e.g., `{{module}}`).

## create-modules
command: python manage.py startapp {{module}}
verify: is_dir({{module}})

## create-routes
command: |
  # Append to {{module}}/urls.py:
  path('{{path}}/', views.{{Controller}}.as_view({'{{method}}': '{{action}}'})),
verify: grep -q "{{Controller}}" {{module}}/urls.py

## create-controllers
# Django calls these ViewSets in DRF
command: |
  cat >> {{module}}/views.py << 'PY'
  from rest_framework import viewsets
  from .models import {{Model}}
  from .serializers import {{Model}}Serializer

  class {{Controller}}(viewsets.ModelViewSet):
      queryset = {{Model}}.objects.all()
      serializer_class = {{Model}}Serializer
  PY
verify: grep -q "{{Controller}}" {{module}}/views.py

## create-models
command: |
  cat >> {{module}}/models.py << 'PY'
  from django.db import models
  class {{Model}}(models.Model):
      created_at = models.DateTimeField(auto_now_add=True)
      updated_at = models.DateTimeField(auto_now=True)
  PY
  python manage.py makemigrations
verify: file_exists({{module}}/models.py)

## create-services
command: |
  touch {{module}}/services.py
  cat >> {{module}}/services.py << 'PY'
  class {{Service}}:
      pass
  PY
verify: file_exists({{module}}/services.py)

## create-repositories
command: |
  touch {{module}}/repositories.py
  cat >> {{module}}/repositories.py << 'PY'
  from .models import {{Model}}
  class {{Repository}}:
      def all(self): return {{Model}}.objects.all()
      def find(self, id): return {{Model}}.objects.filter(pk=id).first()
      def create(self, data): return {{Model}}.objects.create(**data)
      def update(self, id, data):
          {{Model}}.objects.filter(pk=id).update(**data)
          return self.find(id)
      def delete(self, id): {{Model}}.objects.filter(pk=id).delete()
  PY
verify: file_exists({{module}}/repositories.py)

## create-entities
command: |
  mkdir -p {{module}}/domain
  cat > {{module}}/domain/{{Model}}.py << 'PY'
  class {{Model}}Entity:
      def __init__(self, id: int): self.id = id
  PY
verify: file_exists({{module}}/domain/{{Model}}.py)

## create-events
command: |
  touch {{module}}/events.py
  cat >> {{module}}/events.py << 'PY'
  from dataclasses import dataclass
  @dataclass
  class {{Model}}Event:
      type: str
      payload: dict
  PY
verify: file_exists({{module}}/events.py)

## create-use-cases
command: |
  touch {{module}}/use_cases.py
  cat >> {{module}}/use_cases.py << 'PY'
  class {{Model}}UseCase:
      pass
  PY
verify: file_exists({{module}}/use_cases.py)

## create-input-ports
command: |
  touch {{module}}/ports_in.py
  cat >> {{module}}/ports_in.py << 'PY'
  from abc import ABC, abstractmethod
  class I{{Model}}UseCase(ABC):
      pass
  PY
verify: file_exists({{module}}/ports_in.py)

## create-output-ports
command: |
  touch {{module}}/ports_out.py
  cat >> {{module}}/ports_out.py << 'PY'
  from abc import ABC, abstractmethod
  class I{{Repository}}(ABC):
      pass
  PY
verify: file_exists({{module}}/ports_out.py)

## create-module-contracts
command: |
  touch {{module}}/contract.py
  cat >> {{module}}/contract.py << 'PY'
  from abc import ABC
  class I{{Module}}Service(ABC):
      pass
  PY
verify: file_exists({{module}}/contract.py)

## create-dci-contexts
command: |
  mkdir -p dci
  cat > dci/{{Module}}Context.py << 'PY'
  class {{Module}}Context:
      pass
  PY
verify: file_exists(dci/{{Module}}Context.py)

## create-repository-interfaces
command: |
  mkdir -p {{module}}/domain
  cat >> {{module}}/domain/repositories.py << 'PY'
  from abc import ABC, abstractmethod
  class I{{Model}}Repository(ABC):
      pass
  PY
verify: file_exists({{module}}/domain/repositories.py)
