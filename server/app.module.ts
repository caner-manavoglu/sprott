import { Module } from '@nestjs/common';
import { AnnouncementsModule } from './announcements/announcements.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import { BoardModule } from './board/board.module.ts';
import { DashboardModule } from './dashboard/dashboard.module.ts';
import { ForumsModule } from './forums/forums.module.ts';
import { GroupsModule } from './groups/groups.module.ts';
import { LogsModule } from './logs/logs.module.ts';
import { McpModule } from './mcp/mcp.module.ts';
import { NotificationsModule } from './notifications/notifications.module.ts';
import { PermissionsModule } from './permissions/permissions.module.ts';
import { ProjectsModule } from './projects/projects.module.ts';
import { PullRequestsModule } from './pull-requests/pull-requests.module.ts';
import { ReportsModule } from './reports/reports.module.ts';
import { TasksModule } from './tasks/tasks.module.ts';
import { UsersModule } from './users/users.module.ts';
import { WorkflowModule } from './workflow/workflow.module.ts';
import { WorkspaceModule } from './workspace/workspace.module.ts';

@Module({ imports: [WorkspaceModule, AuthModule, BoardModule, TasksModule, PermissionsModule, UsersModule, GroupsModule, ProjectsModule, DashboardModule, ReportsModule, NotificationsModule, WorkflowModule, LogsModule, AnnouncementsModule, PullRequestsModule, McpModule, ForumsModule] })
export class AppModule { }
