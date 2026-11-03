import { AGENT_ICON } from '@/components/ai/Chat';
import { AgentToggle } from '@/components/forms/SettingsForms';
import { Icon } from '@/components/icons';
import { PageTitle } from '@/components/ui';
import { agentContextFor } from '@/lib/ai/context';
import { AGENTS, agentAvailable } from '@/lib/ai/coordinator';
import { AGENT_IDS } from '@/lib/ai/types';
import { getAppContext } from '@/lib/context';

export default async function TeamPage() {
  const ctx = await getAppContext();
  const actx = await agentContextFor(ctx);
  const disabled = ctx.business.agent_settings.disabled ?? [];
  return (
    <div className="stack">
      <PageTitle>{ctx.t.nav.team}</PageTitle>
      <div className="card card-hero row" style={{ alignItems: 'flex-start' }}>
        <span className="stat-icon ic-blue" style={{ margin: 0 }}><Icon name="sparkles" /></span>
        <div className="grow"><div className="bold">{ctx.t.agent.coordinator}</div><p className="small muted" style={{ marginTop: 4 }}>{ctx.t.agentRole.coordinator}</p></div>
      </div>
      <div className="team-grid">
        {AGENT_IDS.map((id) => {
          const mod = AGENTS[id].module;
          const moduleOff = Boolean(mod && !ctx.business.modules.includes(mod));
          const on = agentAvailable(actx, id);
          return (
            <div key={id} className="card row" style={{ alignItems: 'flex-start', opacity: on ? 1 : 0.6 }}>
              <span className={`stat-icon ${AGENT_ICON[id].tone}`} style={{ margin: 0 }}><Icon name={AGENT_ICON[id].icon} /></span>
              <div className="grow">
                <div className="row between"><span className="bold">{ctx.t.agent[id]}</span>
                  {ctx.isOwner && !moduleOff ? <AgentToggle id={id} enabled={!disabled.includes(id)} /> : <span className="pill">{on ? '✓' : ctx.t.ai.agentOff}</span>}
                </div>
                <p className="small muted" style={{ marginTop: 4 }}>{ctx.t.agentRole[id]}</p>
                {moduleOff && mod && <p className="tiny faint" style={{ marginTop: 4 }}>{ctx.t.modules[mod]}: {ctx.t.ai.agentOff}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
