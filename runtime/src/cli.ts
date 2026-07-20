#!/usr/bin/env node

/**
 * LehroCode CLI
 * Command-line interface for the swarm orchestrator
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { Orchestrator, OrchestratorOptions } from './core/orchestrator.js';
import { WorkflowEngine } from './core/workflow-engine.js';
import { Plan, Workflow, ProviderResolution } from './types/index.js';
import YAML from 'yaml';

const program = new Command();
const DEFAULT_AGENT_CONFIG_PATH = './config/agents.yaml';
const DEFAULT_PROVIDER_CONFIG_PATH = './config/providers.yaml';
const HELP_EXAMPLES = [
  '',
  'Examples:',
  '  npm run dev -- run ../workflows/project-portal',
  '  npm run dev -- status ../workflows/project-portal',
  '  npm run dev -- providers validate',
  '',
  'Notes:',
  '  - npm run dev without a command only prints this help and exits.',
  '  - run expects a project folder that contains PLAN.md.',
].join('\n');

interface RuntimeOptions {
  skills?: string;
  agents?: string;
  workflows?: string;
  agentsConfig?: string;
  providers?: string;
  maxConcurrency?: string;
  provider?: string;
  model?: string;
}

interface ProviderValidationTarget {
  agent: string;
  providerId: string;
  model: string;
  resolution: ProviderResolution;
}

// Load package.json for version
const packagePath = join(process.cwd(), 'package.json');
const pkg = existsSync(packagePath) 
  ? JSON.parse(readFileSync(packagePath, 'utf-8'))
  : { version: '1.0.0' };

program
  .name('lehrocode')
  .description('LehroCode Swarm Orchestrator - Multi-agent workflow runner')
  .version(pkg.version)
  .addHelpText('after', HELP_EXAMPLES);

program
  .command('run')
  .description('Execute a workflow from PLAN.md')
  .argument('<project>', 'Project name or path')
  .option('-d, --dry-run', 'Simulate execution without LLM calls', false)
  .option('-p, --plan <path>', 'Path to PLAN.md file', 'PLAN.md')
  .option('--skills <path>', 'Path to skills directory', './skills')
  .option('--agents <path>', 'Path to agents directory', './agents')
  .option('--agents-config <path>', 'Path to agents YAML manifest', DEFAULT_AGENT_CONFIG_PATH)
  .option('--providers <path>', 'Path to providers YAML manifest', DEFAULT_PROVIDER_CONFIG_PATH)
  .option('--provider <id>', 'Override all workflow tasks to use a single provider')
  .option('--model <name>', 'Override the model used with the selected provider')
  .option('--workflows <path>', 'Path to workflows directory', './workflows')
  .option('--max-concurrency <n>', 'Maximum parallel tasks', '4')
  .action(async (project, options) => {
    const spinner = ora('Initializing LehroCode orchestrator').start();

    try {
      const projectPath = resolve(project);
      
      // Initialize orchestrator
      const orchestrator = new Orchestrator(createOrchestratorOptions(options));

      // Load or create PLAN
      const planPath = join(projectPath, options.plan);
      let workflow: Workflow;

      if (existsSync(planPath)) {
        spinner.text = 'Loading execution plan...';
        const planContent = readFileSync(planPath, 'utf-8');
        const plan = parsePlan(planContent);
        workflow = orchestrator.createWorkflowFromPlan(plan, projectPath);
      } else {
        // Try to load existing workflow
        spinner.text = 'Loading existing workflow...';
        const existing = orchestrator.loadWorkflow(project);
        if (!existing) {
          throw new Error(`No PLAN.md found at ${planPath} and no existing workflow`);
        }
        workflow = existing;
      }

      spinner.succeed(`Loaded workflow: ${workflow.name} (${workflow.tasks.length} tasks)`);

      if (!options.dryRun) {
        const validation = validateWorkflowProviders(orchestrator, workflow, options.provider, options.model);
        if (validation.length > 0) {
          console.log(chalk.red('\nProvider validation failed:\n'));
          for (const target of validation) {
            const status = target.resolution.configured ? chalk.green('ready') : chalk.red('missing config');
            console.log(chalk.white(`  ${target.agent} → ${target.providerId} / ${target.model} (${status})`));
            if (target.resolution.missing.length > 0) {
              console.log(chalk.gray(`    ${target.resolution.missing.join(', ')}`));
            }
          }
          console.log('');
          process.exit(1);
        }
      }

      // Execute workflow
      console.log(chalk.blue('\n▶ Starting workflow execution...\n'));

      let completedTasks = 0;
      let failedTasks = 0;

      orchestrator.on('task:started', (task) => {
        console.log(chalk.yellow(`  [${task.agent}] ${task.name} - Running...`));
      });

      orchestrator.on('task:completed', ({ task, result }) => {
        completedTasks++;
        if (result.success) {
          console.log(chalk.green(`  ✓ ${task.name} - Complete`));
          if (result.filesCreated.length > 0) {
            console.log(chalk.gray(`    Created: ${result.filesCreated.join(', ')}`));
          }
        } else {
          failedTasks++;
          console.log(chalk.red(`  ✗ ${task.name} - Failed`));
        }
      });

      orchestrator.on('task:failed', ({ task, error }) => {
        failedTasks++;
        console.log(chalk.red(`  ✗ ${task.name} - Error: ${error.message}`));
      });

      await orchestrator.execute({
        workflow,
        dryRun: options.dryRun,
        autoRollback: true,
        providerId: options.provider,
        model: options.model
      });

      // Summary
      console.log(chalk.blue('\n┌─────────────────────────────────────┐'));
      console.log(chalk.blue('│         Workflow Complete           │'));
      console.log(chalk.blue('├─────────────────────────────────────┤'));
      console.log(chalk.blue(`│  Tasks: ${completedTasks} completed, ${failedTasks} failed       │`));
      console.log(chalk.blue(`│  Status: ${workflow.status.padEnd(26)}│`));
      console.log(chalk.blue('└─────────────────────────────────────┘\n'));

      process.exit(failedTasks > 0 ? 1 : 0);

    } catch (error) {
      spinner.fail('Workflow execution failed');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check workflow status')
  .argument('<project>', 'Project name')
  .option('--workflows <path>', 'Path to workflows directory', './workflows')
  .action(async (project, options) => {
    try {
      const orchestrator = new Orchestrator(createOrchestratorOptions(options));

      const status = orchestrator.getStatus(project);

      if (!status.workflow) {
        console.log(chalk.yellow(`\nNo workflow found for: ${project}\n`));
        return;
      }

      const wf = status.workflow;
      
      console.log(chalk.blue(`\n📁 ${wf.name}`));
      console.log(chalk.gray(`   Status: ${wf.status}`));
      console.log(chalk.gray(`   Tasks: ${wf.tasks.length}`));
      console.log(chalk.gray(`   Snapshots: ${status.snapshots}`));
      
      if (wf.startedAt) {
        console.log(chalk.gray(`   Started: ${wf.startedAt.toLocaleString()}`));
      }

      console.log(chalk.blue('\n   Tasks:'));
      for (const task of wf.tasks) {
        const icon = task.status === 'completed' ? '✓' :
                     task.status === 'failed' ? '✗' :
                     task.status === 'running' ? '▶' : '○';
        const color = task.status === 'completed' ? chalk.green :
                      task.status === 'failed' ? chalk.red :
                      task.status === 'running' ? chalk.yellow : chalk.gray;
        console.log(color(`     ${icon} ${task.name} (${task.agent}) - ${task.status}`));
      }

      console.log('');

    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback workflow to previous state')
  .argument('<project>', 'Project name')
  .option('--workflows <path>', 'Path to workflows directory', './workflows')
  .action(async (project, options) => {
    const spinner = ora(`Rolling back ${project}`).start();

    try {
      const orchestrator = new Orchestrator(createOrchestratorOptions(options));

      const status = orchestrator.getStatus(project);
      
      if (!status.workflow) {
        spinner.fail('Workflow not found');
        process.exit(1);
      }

      orchestrator.rollback(project, status.workflow.projectPath);
      
      spinner.succeed('Rollback complete');

    } catch (error) {
      spinner.fail('Rollback failed');
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

program
  .command('agents')
  .description('List available agents and their configured providers')
  .option('--agents <path>', 'Path to agents directory', './agents')
  .option('--agents-config <path>', 'Path to agents YAML manifest', DEFAULT_AGENT_CONFIG_PATH)
  .option('--providers <path>', 'Path to providers YAML manifest', DEFAULT_PROVIDER_CONFIG_PATH)
  .action((options) => {
    const orchestrator = new Orchestrator(createOrchestratorOptions(options));
    const agents = orchestrator.getAgentConfigs();
    const providers = new Map(
      orchestrator.getAvailableProviders().map(provider => [provider.profile?.id ?? '', provider])
    );
    
    console.log(chalk.blue('\n🤖 Available Agents:\n'));
    
    for (const config of agents) {
      const emoji = getAgentEmoji(config.role);
      const provider = config ? providers.get(config.provider) : undefined;
      const providerLabel = provider?.profile?.label ?? config?.provider ?? 'unknown provider';
      const model = config?.model ?? 'unknown model';
      const configured = provider?.configured ? chalk.green('configured') : chalk.yellow('needs config');

      console.log(chalk.white(`  ${emoji} ${config.role} → ${providerLabel} / ${model} (${configured})`));
    }
    
    console.log('');
  });

const providersCommand = program
  .command('providers')
  .description('List available AI providers')
  .option('--providers <path>', 'Path to providers YAML manifest', DEFAULT_PROVIDER_CONFIG_PATH)
  .action((options) => {
    const orchestrator = new Orchestrator(createOrchestratorOptions(options));
    const providers = orchestrator.getAvailableProviders();

    console.log(chalk.blue('\n🧠 Available Providers:\n'));

    for (const provider of providers) {
      const status = provider.configured ? chalk.green('ready') : chalk.yellow('missing config');
      const missing = provider.missing.length > 0 ? chalk.gray(` - ${provider.missing.join(', ')}`) : '';
      const endpoint = provider.endpoint ? chalk.gray(` @ ${provider.endpoint}`) : '';
      console.log(chalk.white(`  ${provider.profile?.label ?? provider.profile?.id ?? 'unknown'} (${provider.profile?.id ?? 'n/a'}) - ${provider.model} - ${status}${endpoint}${missing}`));
    }

    console.log('');
  });

providersCommand
  .command('validate')
  .description('Validate provider secrets and endpoints')
  .option('--providers <path>', 'Path to providers YAML manifest', DEFAULT_PROVIDER_CONFIG_PATH)
  .option('--provider <id>', 'Validate a single provider')
  .option('--model <name>', 'Override the model used for validation')
  .action((options) => {
    const orchestrator = new Orchestrator(createOrchestratorOptions(options));

    if (options.provider) {
      const resolution = orchestrator.resolveProvider(options.provider, options.model);
      printProviderResolution(resolution, options.provider, options.model ?? resolution.model);
      process.exit(resolution.configured ? 0 : 1);
      return;
    }

    const providerStatuses = orchestrator.getAvailableProviders();
    let hasFailures = false;

    console.log(chalk.blue('\n🔐 Provider Validation:\n'));

    for (const provider of providerStatuses) {
      const resolution = orchestrator.resolveProvider(provider.profile?.id ?? provider.profile?.label ?? 'unknown');
      const status = resolution.configured ? chalk.green('ready') : chalk.red('missing config');
      console.log(chalk.white(`  ${provider.profile?.label ?? provider.profile?.id ?? 'unknown'} (${provider.profile?.id ?? 'n/a'}) - ${status}`));

      if (!resolution.configured) {
        hasFailures = true;
        if (resolution.missing.length > 0) {
          console.log(chalk.gray(`    ${resolution.missing.join(', ')}`));
        }
      }
    }

    console.log('');
    process.exit(hasFailures ? 1 : 0);
  });

// Parse PLAN.md content
function parsePlan(content: string): Plan {
  // Try YAML first, then JSON, then simple markdown
  try {
    return YAML.parse(content);
  } catch {
    try {
      return JSON.parse(content);
    } catch {
      // Basic markdown parsing - extract tasks from headers
      return parseMarkdownPlan(content);
    }
  }
}

function parseMarkdownPlan(content: string): Plan {
  // Extract tasks from markdown headers
  const tasks: Plan['tasks'] = [];
  const lines = content.split('\n');
  let currentTask: Partial<Plan['tasks'][0]> | null = null;
  let section: string | null = null;

  for (const line of lines) {
    // Task header (### Task N: Name)
    const taskMatch = line.match(/^###\s+Task\s+\d+:\s*(.+)/i);
    if (taskMatch) {
      if (currentTask && currentTask.id) {
        tasks.push(currentTask as Plan['tasks'][0]);
      }
      currentTask = {
        id: `task_${tasks.length + 1}`,
        name: taskMatch[1].trim(),
        agent: 'coder',
        files: [],
        input: '',
        output: '',
        acceptance: '',
        dependsOn: []
      };
      section = null;
      continue;
    }

    // Section headers within task
    const sectionMatch = line.match(/^-\s*\*\*(\w+):\*\*/);
    if (sectionMatch && currentTask) {
      section = sectionMatch[1].toLowerCase();
      continue;
    }

    // Content lines
    if (currentTask && section) {
      const content = line.replace(/^\s*-\s*/, '').trim();
      if (content) {
        switch (section) {
          case 'agent':
            currentTask.agent = content as Plan['tasks'][0]['agent'];
            break;
          case 'files':
            // Parse file operations
            const fileMatch = content.match(/(\w+):\s*(.+)/);
            if (fileMatch) {
              currentTask.files ??= [];
              currentTask.files.push({
                action: fileMatch[1] as 'create' | 'modify' | 'delete',
                path: fileMatch[2]
              });
            }
            break;
          case 'input':
            currentTask.input += (currentTask.input ? '\n' : '') + content;
            break;
          case 'output':
            currentTask.output += (currentTask.output ? '\n' : '') + content;
            break;
          case 'acceptance':
            currentTask.acceptance += (currentTask.acceptance ? '\n' : '') + content;
            break;
        }
      }
    }
  }

  if (currentTask && currentTask.id) {
    tasks.push(currentTask as Plan['tasks'][0]);
  }

  return {
    name: 'Parsed Plan',
    description: 'Parsed from markdown',
    dependencies: [],
    tasks
  };
}

function getAgentEmoji(agent: string): string {
  const emojis: Record<string, string> = {
    'architect': '🏗️',
    'coder': '💻',
    'frontend-dev': '🎨',
    'backend-dev': '⚙️',
    'reviewer': '🔍',
    'tester': '🧪',
    'deployer': '🚀'
  };
  return emojis[agent] || '🤖';
}

function createOrchestratorOptions(options: RuntimeOptions): OrchestratorOptions {
  return {
    skillsPath: resolve(options.skills || './skills'),
    agentsPath: resolve(options.agents || './agents'),
    workflowsPath: resolve(options.workflows || './workflows'),
    agentConfigPath: resolve(options.agentsConfig || DEFAULT_AGENT_CONFIG_PATH),
    providersPath: resolve(options.providers || DEFAULT_PROVIDER_CONFIG_PATH),
    maxConcurrency: options.maxConcurrency ? parseInt(options.maxConcurrency, 10) : 4
  };
}

function validateWorkflowProviders(
  orchestrator: Orchestrator,
  workflow: Workflow,
  providerOverride?: string,
  modelOverride?: string
): ProviderValidationTarget[] {
  const targets: ProviderValidationTarget[] = [];
  const seen = new Set<string>();

  for (const task of workflow.tasks) {
    const agentConfig = orchestrator.getAgentConfig(task.agent);
    if (!agentConfig) {
      const resolution: ProviderResolution = {
        known: false,
        model: '',
        configured: false,
        missing: [`Unknown agent: ${task.agent}`]
      };
      targets.push({
        agent: task.agent,
        providerId: 'unknown',
        model: '',
        resolution
      });
      continue;
    }

    const providerId = providerOverride ?? agentConfig.provider;
    const model = modelOverride ?? agentConfig.model;
    const key = `${task.agent}:${providerId}:${model}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    targets.push({
      agent: task.agent,
      providerId,
      model,
      resolution: orchestrator.resolveProvider(providerId, model)
    });
  }

  return targets.filter(target => !target.resolution.known || !target.resolution.configured);
}

function printProviderResolution(
  resolution: ProviderResolution,
  providerId: string,
  model: string
): void {
  console.log(chalk.blue('\n🔐 Provider Validation:\n'));
  const status = resolution.configured ? chalk.green('ready') : chalk.red('missing config');
  console.log(chalk.white(`  ${providerId} / ${model} - ${status}`));

  if (resolution.endpoint) {
    console.log(chalk.gray(`    endpoint: ${resolution.endpoint}`));
  }

  if (resolution.missing.length > 0) {
    console.log(chalk.gray(`    missing: ${resolution.missing.join(', ')}`));
  }

  console.log('');
}

// Run CLI
program.parse();
