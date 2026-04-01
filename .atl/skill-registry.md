# Skill Registry

This file documents the AI agent skills available for this project.

## Installed Skills

### webapp-testing
- **Source**: anthropics/skills
- **Installs**: 35.2K
- **Purpose**: Web application testing patterns with Vitest and Playwright
- **Location**: `~/.agents/skills/webapp-testing`

### docker-expert
- **Source**: sickn33/antigravity-awesome-skills
- **Installs**: 8.9K
- **Purpose**: Docker Compose, multi-stage Dockerfiles, container optimization
- **Location**: `~/.agents/skills/docker-expert`

### typescript-expert
- **Source**: sickn33/antigravity-awesome-skills
- **Installs**: 4.6K
- **Purpose**: TypeScript best practices, advanced types, type-safe APIs
- **Location**: `~/.agents/skills/typescript-expert`

### find-skills
- **Source**: Built-in
- **Purpose**: Discover and install additional skills

## How to Use

When working on this project, AI agents should:

1. **Testing**: Load `webapp-testing` skill when writing tests
2. **Docker**: Load `docker-expert` skill when modifying Docker configs
3. **TypeScript**: Load `typescript-expert` skill when working with types

## Finding More Skills

```bash
# Search for skills
npx skills find <query>

# Install new skill
npx skills add <owner/repo@skill> -g -y
```

## Project Standards

This project follows the conventions in `AGENTS.md`. All AI agents should:
- Follow TypeScript strict mode
- Write tests for new features
- Use Zod for validation
- Follow RESTful API patterns
