import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CocktailArt, Field, Modal, Submit } from './components';
import { categories } from './model';
import { menuImage, menuPhotos, photoGroups } from './images';
import { useBar } from './store';
import type { Ingredient, MenuCategory } from './types';

export default function StaffCocktailForm({ close }: { close: () => void }) {
  const { staffData, run } = useBar();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuCategory>('cocktail');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState(0);
  const catalog = staffData?.ingredients || [];
  const available = catalog.filter((a) => !ingredients.some((i) => i.alcoholId === a.id));
  const update = (index: number, value: Partial<Ingredient>) =>
    setIngredients(ingredients.map((item, i) => (i === index ? { ...item, ...value } : item)));
  return (
    <Modal title="Добавить коктейль" subtitle="Название и состав на одну порцию" close={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              { type: 'createCocktail', value: { name, category, ingredients, notes, image } },
              'Коктейль добавлен. Администратор сможет подготовить его к продаже.',
            )
          )
            close();
        }}
      >
        <Field label="Название коктейля">
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Категория">
          <select value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Изображение">
          <select value={image} onChange={(e) => setImage(Number(e.target.value))}>
            <option value={0}>Подобрать по названию</option>
            {photoGroups.map((group, index) => (
              <optgroup key={group.file} label={group.label}>
                {menuPhotos
                  .filter((p) => p.sheet === index)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <div className="staff-recipe-preview">
          <CocktailArt image={menuImage({ name, category, image })} name={name || 'Новый коктейль'} />
        </div>
        <div className="ingredient-label">
          <span>Ингредиенты</span>
          <small>Количество на одну порцию</small>
        </div>
        {ingredients.map((ingredient, index) => {
          const unit = catalog.find((a) => a.id === ingredient.alcoholId)?.unit === 'g' ? 'г' : 'мл';
          return (
            <div className="ingredient-inputs" key={index}>
              <select
                aria-label={`Ингредиент ${index + 1}`}
                required
                value={ingredient.alcoholId}
                onChange={(e) => update(index, { alcoholId: e.target.value })}
              >
                {catalog
                  .filter(
                    (a) => a.id === ingredient.alcoholId || !ingredients.some((i) => i.alcoholId === a.id),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <label>
                <input
                  aria-label={`Количество ингредиента ${index + 1}, ${unit}`}
                  type="number"
                  required
                  min="0.01"
                  max="1000000"
                  step="0.01"
                  value={ingredient.ml || ''}
                  onChange={(e) => update(index, { ml: Number(e.target.value) })}
                />
                <span>{unit}</span>
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Удалить ингредиент ${index + 1}`}
                onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button secondary full"
          disabled={!available.length || ingredients.length >= 30}
          onClick={() => setIngredients([...ingredients, { alcoholId: available[0].id, ml: 50 }])}
        >
          <Plus size={16} /> Добавить ингредиент
        </button>
        <Field label="Как приготовить">
          <textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <p className="form-help">После настройки администратором коктейль станет доступен для продажи.</p>
        <Submit disabled={!name.trim() || !ingredients.length}>Сохранить коктейль</Submit>
      </form>
    </Modal>
  );
}
