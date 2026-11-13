<script setup>
defineProps({ result: { type: Object, required: true } });

const channels = { physical:'物理', magic:'魔力', fire:'火', lightning:'雷', holy:'圣' };
const physicalTypes = { normal:'普通', slash:'斩击', strike:'打击', thrust:'突刺' };
const digits = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const factors = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 5 });

function product(items) {
  return items.map(({ name, factor }) => ` × ${factors.format(factor)}（${name}）`).join('');
}

function baseExpression(step) {
  if (step.projectile) {
    const { base, reinforcement, correction, commonScale, qualityRate } = step.projectile;
    const redFactor = qualityRate && qualityRate !== 1 ? ` × ${factors.format(qualityRate)}（红武弹体）` : '';
    return `${base}（弹体基础）${redFactor} × ${reinforcement}（强化） × ${factors.format(correction)}（角色补正） × ${commonScale}`;
  }
  if (step.panel === null) return `${digits.format(step.flat)}（弹体分量）`;
  let expression = `${digits.format(step.panel)}（面板）${product(step.panelFactors)}`;
  if (step.enchant) expression = `(${expression} + ${step.enchant} 附魔)`;
  expression += ` × ${factors.format(step.rate)}（动作倍率）`;
  if (step.flat) expression = `(${expression} + ${step.flat})`;
  return expression;
}
</script>

<template>
  <details v-if="result.rows?.some(row => row.total != null)" class="damage-formula">
    <summary>查看算式</summary>
    <section v-for="row in result.rows.filter(row => row.total != null)" :key="row.id">
      <strong>{{ row.name }}</strong>
      <div v-for="(step, channel) in row.formula" :key="channel" class="formula-channel">
        <span>{{ channel === 'physical' ? physicalTypes[row.physicalType] || channels.physical : channels[channel] }}</span>
        <div>
          <p>{{ baseExpression(step) }}{{ product(step.hitFactors) }} ≈ {{ digits.format(step.beforeDefense) }}</p>
          <p v-if="step.defense != null">参考防御曲线（攻击 {{ digits.format(step.beforeDefense) }}，防御 {{ step.defense }}）≈ {{ digits.format(step.afterCurve) }}</p>
          <p v-if="step.taken != null || row.hits > 1">
            {{ digits.format(step.afterCurve ?? step.beforeDefense) }}<template v-if="step.taken != null"> × {{ factors.format(step.taken) }}（目标受伤倍率）</template>{{ product(step.finalFactors) }}<template v-if="row.hits > 1"> × {{ row.hits }} 次</template> ≈ {{ digits.format(row.channels[channel]) }}
          </p>
        </div>
      </div>
    </section>
    <p v-if="result.rows.filter(row => row.total != null).length > 1" class="formula-sum">{{ result.rows.filter(row => row.total != null).map(row => digits.format(row.total)).join(' + ') }} ≈ {{ digits.format(result.total) }}</p>
  </details>
</template>

<style scoped>
.damage-formula { margin-top: 10px; border-top: 1px solid #34495b; padding-top: 8px; font: 13px/1.6 Arial,'Microsoft YaHei',sans-serif; font-variant-numeric: tabular-nums; }
.damage-formula summary { color: #e2c994; cursor: pointer; }
.damage-formula section { margin-top: 10px; }
.damage-formula strong { color: #e6d9ba; font-weight: 600; }
.formula-channel { display: grid; grid-template-columns: auto 1fr; gap: 8px; margin-top: 4px; }
.formula-channel span { color: #b6cbdb; }
.formula-channel p, .formula-sum { margin: 0; overflow-wrap: anywhere; }
.formula-sum { border-top: 1px solid #34495b; margin-top: 8px; padding-top: 6px; }
</style>
