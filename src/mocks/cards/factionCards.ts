/**
 * 阵营牌：按「同盟组合」分池，每对 6 张专属交换牌。
 *
 * 设计要点
 * - 一张牌同时写两边：pair[0] 吃 effects，pair[1] 吃 allyEffects。
 *   谁选中都按阵营结算，萨卡兹选和深池选结果一致。
 * - 交换永远是双向的：一方拿到东西，另一方必然也要付出点什么，
 *   或者让出代理人替自己干脏活（progress / allyProgress）。
 * - 每对 6 张，一回合抽 2 选 1，双方协商后由座次靠前的一方拍板。
 */
import type { FactionId } from '@/types'
import { factionCard } from './helper'

/** 王庭要的是战火，深池要的是军械 —— 最赤裸的以物易物 */
const SARK_TARA: [FactionId, FactionId] = ['SARK', 'TARA']
/** 王权需要医药与情报，罗德岛需要合法性与庇护 */
const VIC_RI: [FactionId, FactionId] = ['VIC', 'RI']
/** 王旗换面包：典范军要人望，自救军要粮食 */
const VIC_SSC: [FactionId, FactionId] = ['VIC', 'SSC']
/** 药品换感染者：罗德岛要人力，整合运动要抑制剂 */
const RI_REU: [FactionId, FactionId] = ['RI', 'REU']
/** 管网换诊所：一个要地图，一个要药 */
const RI_SSC: [FactionId, FactionId] = ['RI', 'SSC']
/** 街垒换罢工：底层的两种活法互相打气 */
const REU_SSC: [FactionId, FactionId] = ['REU', 'SSC']

export const FACTION_CARDS = [
  // ---------- 萨卡兹 ↔ 塔拉／深池 ----------
  factionCard(
    'F-ST1',
    '军械换进击',
    SARK_TARA,
    { supply: -3, morale: 1 },
    { supply: 3, morale: -1 },
    '王庭拨出一批军械，换深池在前线放火。烧起来的每一处，都算在阿喃那的账上。',
    { progress: 1 },
  ),
  factionCard(
    'F-ST2',
    '血债的账本',
    SARK_TARA,
    { manpower: -1, morale: 2 },
    { manpower: 2, morale: -1 },
    '深池替王庭清算旧账，王庭则交出一批青壮。谁的名字被划掉，两边都不问。',
  ),
  factionCard(
    'F-ST3',
    '飞空艇的阴影',
    SARK_TARA,
    { manpower: -1, morale: 1 },
    { morale: 2, supply: -1 },
    '死魂灵的躯体掠过塔拉上空。深池借这份恐惧立威，王庭则要好生安抚自己的王庭。',
  ),
  factionCard(
    'F-ST4',
    '塔拉暗桩',
    SARK_TARA,
    { manpower: 2, morale: -1 },
    { supply: -2, morale: 1 },
    '深池的暗桩替王庭清出一条路，代价是王庭默许他们的旗子插在旧城里。',
  ),
  factionCard(
    'F-ST5',
    '同一面墙',
    SARK_TARA,
    { supply: -1, morale: 1 },
    { morale: 1 },
    '面对典范军，两方在同一段城墙下并肩上阵。谁先退，谁就得独自面对明天。',
  ),
  factionCard(
    'F-ST6',
    '王庭的庇护',
    SARK_TARA,
    { morale: -2 },
    { morale: 3, manpower: -1 },
    '王庭替深池挡下一次清算，深池则要交出壮丁。庇护从来不是白给的。',
  ),

  // ---------- 典范军 ↔ 罗德岛 ----------
  factionCard(
    'F-VR1',
    '战地医院',
    VIC_RI,
    { supply: -2, morale: 1 },
    { manpower: 3, morale: -1 },
    '罗德岛的战地医院向典范军敞开，伤员回到了队列，医生则熬红了眼。',
  ),
  factionCard(
    'F-VR2',
    '王室特许状',
    VIC_RI,
    { morale: -1, supply: 2 },
    { morale: 2, supply: -1 },
    '一纸特许状让罗德岛在首都合法行医，王储的声望则被切走了一块。',
  ),
  factionCard(
    'F-VR3',
    '诸王的档案',
    VIC_RI,
    { morale: 2, manpower: -1 },
    { manpower: 2, morale: -1 },
    '巴别塔的旧档换来了王室的征召名册。两边都拿到了想要的名字。',
  ),
  factionCard(
    'F-VR4',
    '移动城市的坐标',
    VIC_RI,
    { supply: 2, morale: -1 },
    { supply: -1, morale: 2 },
    '罗德岛交出一条只有他们知道的路径，换王储在议会上替他们说一句话。',
  ),
  factionCard(
    'F-VR5',
    '白旗与王旗',
    VIC_RI,
    { morale: 1 },
    { morale: 1, supply: -1 },
    '两面临时并排的旗。城里的人看见了，敌人的望远镜也看见了。',
  ),
  factionCard(
    'F-VR6',
    '矿石病诊疗所',
    VIC_RI,
    { supply: -2, morale: 1 },
    { morale: 3, manpower: -1 },
    '典范军出物资，罗德岛出人。诊疗所前排起的长队，是两边都想要的画面。',
  ),

  // ---------- 典范军 ↔ 市民自救军 ----------
  factionCard(
    'F-VS1',
    '街区的面包',
    VIC_SSC,
    { supply: 3, morale: -1 },
    { supply: -2, morale: 2 },
    '自救军把仅存的口粮送进王储的车队，换来一句承诺。面包是真的，承诺要等等看。',
  ),
  factionCard(
    'F-VS2',
    '王旗护街',
    VIC_SSC,
    { morale: -2, manpower: 1 },
    { morale: 3, manpower: -1 },
    '王旗插在街垒上，士兵替市民挡了一夜。第二天街垒上少了几个人。',
  ),
  factionCard(
    'F-VS3',
    '议会广场的集会',
    VIC_SSC,
    { morale: 2, supply: -1 },
    { supply: 2, manpower: -1 },
    '自救军组织人群，王储站上台。散场时广场被清扫干净，人也少了一批。',
  ),
  factionCard(
    'F-VS4',
    '撤离通道',
    VIC_SSC,
    { manpower: -1, morale: 1 },
    { manpower: 2, morale: -1 },
    '典范军让开一条通道，自救军把人送出战区。留下的人反而更能拼命。',
  ),
  factionCard(
    'F-VS5',
    '同一条街',
    VIC_SSC,
    { morale: 1 },
    { morale: 1, supply: -1 },
    '同一个街口，两种旗子轮流站岗。市民开始分不清该向谁敬礼。',
  ),
  factionCard(
    'F-VS6',
    '工人的名册',
    VIC_SSC,
    { manpower: 2, morale: -1 },
    { morale: 2, supply: -1 },
    '自救军交出工厂的名册，王储的征兵官按图索骥。名单上的人都还没死。',
  ),

  // ---------- 罗德岛 ↔ 整合运动 ----------
  factionCard(
    'F-RE1',
    '抑制剂配额',
    RI_REU,
    { supply: -2, morale: 1 },
    { supply: 3, morale: -1 },
    '罗德岛拨出抑制剂，整合运动负责把人带回来。药是真的，人未必都能回来。',
  ),
  factionCard(
    'F-RE2',
    '感染者的名单',
    RI_REU,
    { manpower: 2, supply: -1 },
    { manpower: -1, morale: 1 },
    '整合运动交出一份名单，罗德岛按名单找人。被写下的人不知道自己被交易过。',
  ),
  factionCard(
    'F-RE3',
    '共同的敌人',
    RI_REU,
    { morale: 1 },
    { morale: 1, supply: -1 },
    '两方在同一场巷战里背靠背。打完这一夜，谁也没提下一夜。',
  ),
  factionCard(
    'F-RE4',
    '医疗中立区',
    RI_REU,
    { morale: -1, supply: 1 },
    { morale: 2, manpower: -1 },
    '罗德岛划出一块不设防的地，整合运动答应不在那里动手。两边都在违约边缘。',
  ),
  factionCard(
    'F-RE5',
    '废城的地道',
    RI_REU,
    { supply: 2, manpower: -1 },
    { supply: -1, manpower: 1 },
    '整合运动带路，罗德岛运货。地道里没有阵营，只有谁先到出口。',
  ),
  factionCard(
    'F-RE6',
    '塔露拉的旧识',
    RI_REU,
    { morale: 2, manpower: -1 },
    { morale: 2, supply: -1 },
    '一封旧信让两边坐到同一张桌前。桌上的茶是凉的，话是热的。',
  ),

  // ---------- 罗德岛 ↔ 市民自救军 ----------
  factionCard(
    'F-RS1',
    '地下管网图',
    RI_SSC,
    { supply: 2, manpower: -1 },
    { supply: -1, morale: 1 },
    '自救军把管网图摊开，罗德岛的运输队从此不再走地面。',
  ),
  factionCard(
    'F-RS2',
    '联合诊所',
    RI_SSC,
    { supply: -2, morale: 1 },
    { morale: 3, manpower: -1 },
    '罗德岛出药，自救军出场地。诊所门口排队的人越来越多，也越来越安静。',
  ),
  factionCard(
    'F-RS3',
    '废料重铸',
    RI_SSC,
    { supply: 2, morale: -1 },
    { supply: -1, manpower: 1 },
    '工坊把废铁重铸成能用的东西，罗德岛按市价收走一半。',
  ),
  factionCard(
    'F-RS4',
    '街角的守望',
    RI_SSC,
    { manpower: 1 },
    { manpower: 1, supply: -1 },
    '邻居轮流守街口，罗德岛的干员也在其中。谁来了都看得见。',
  ),
  factionCard(
    'F-RS5',
    '口粮的分配',
    RI_SSC,
    { supply: -1, morale: 1 },
    { supply: 2, morale: -1 },
    '罗德岛把口粮交给街区自己分。分完之后，没人再提那批账。',
  ),
  factionCard(
    'F-RS6',
    '城市记忆',
    RI_SSC,
    { manpower: 2, supply: -1 },
    { supply: 2, manpower: -1 },
    '市民记得每条街原本的样子，罗德岛记得每个仓库的位置。交换之后两边都更清楚该往哪走。',
  ),

  // ---------- 整合运动 ↔ 市民自救军 ----------
  factionCard(
    'F-ES1',
    '街垒同盟',
    REU_SSC,
    { manpower: 2, supply: -1 },
    { manpower: -1, morale: 1 },
    '两条街的街垒连成一条线。守线的人不够，但线守住了。',
  ),
  factionCard(
    'F-ES2',
    '罢工的齿轮',
    REU_SSC,
    { morale: -1, supply: 1 },
    { morale: 2, supply: -1 },
    '整合运动让工厂停摆，自救军把停摆变成声势。代价是两边都少了口粮。',
  ),
  factionCard(
    'F-ES3',
    '工人武装',
    REU_SSC,
    { supply: -2, morale: 1 },
    { manpower: 2, morale: -1 },
    '整合运动出武器，自救军出人。拿着枪的工人第一次站到了街口。',
  ),
  factionCard(
    'F-ES4',
    '被压迫者的旗帜',
    REU_SSC,
    { morale: 1 },
    { morale: 1, supply: -1 },
    '一面旗同时属于两个组织。举旗的人不在乎这面旗该叫什么。',
  ),
  factionCard(
    'F-ES5',
    '井下的通道',
    REU_SSC,
    { supply: 2, manpower: -1 },
    { supply: -1, manpower: 1 },
    '矿道通向城外。整合运动知道入口，自救军知道出口。',
  ),
  factionCard(
    'F-ES6',
    '共同的街区',
    REU_SSC,
    { morale: 2, manpower: -1 },
    { morale: 2, supply: -1 },
    '同一个街区，两套组织。挨家挨户敲门的时候总会撞上对方。',
  ),
]
